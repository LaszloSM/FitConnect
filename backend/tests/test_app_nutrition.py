"""Nutrición en la app: metas con consentimiento, alimentos y registro de comidas."""
import uuid

from app.services import foods
from tests.test_app_mobile import _app_login, _h


async def _ready_user(client):
    _, t = await _app_login(client)
    h = _h(t["access_token"])
    await client.post("/api/v1/me/consents", json={"kind": "health", "granted": True}, headers=h)
    r = await client.patch("/api/v1/me", json={"birth_date": "1996-01-01", "sex": "male", "height_cm": 180,
                                               "weight_kg": 80, "goal": "gain_muscle", "activity_level": "moderate"},
                           headers=h)
    assert r.status_code == 200, r.text
    return h


async def test_targets_need_consent_and_complete_data(client):
    _, t = await _app_login(client)
    h = _h(t["access_token"])
    r = (await client.get("/api/v1/me/nutrition/targets", headers=h)).json()
    assert r["available"] is False and r["reason"] == "consent"
    await client.post("/api/v1/me/consents", json={"kind": "health", "granted": True}, headers=h)
    r = (await client.get("/api/v1/me/nutrition/targets", headers=h)).json()
    assert r["reason"] == "missing" and "peso" in r["missing"]


async def test_targets_for_a_complete_profile(client):
    h = await _ready_user(client)
    r = (await client.get("/api/v1/me/nutrition/targets", headers=h)).json()
    assert r["available"] is True
    assert r["targets"]["bmr"] > 1700 and r["targets"]["protein_g"] == 144
    assert r["notice"] and r["references"]


async def test_reference_foods_are_searchable(client):
    h = await _ready_user(client)
    found = (await client.get("/api/v1/me/foods", params={"q": "arroz"}, headers=h)).json()
    assert any(f["name"] == "Arroz blanco cocido" and f["kcal"] == 130 for f in found)


async def test_meal_log_is_idempotent_and_adds_up(client):
    h = await _ready_user(client)
    rice = [f for f in (await client.get("/api/v1/me/foods", params={"q": "Arroz blanco"}, headers=h)).json()][0]
    eid = str(uuid.uuid4())
    body = {"id": eid, "meal": "lunch", "food_id": rice["id"], "grams": 150}
    first = (await client.post("/api/v1/me/meals", json=body, headers=h)).json()
    assert first["status"] == "created" and first["entry"]["kcal"] == 195.0
    assert (await client.post("/api/v1/me/meals", json=body, headers=h)).json()["status"] == "duplicate"
    day = (await client.get("/api/v1/me/meals", headers=h)).json()
    assert day["totals"]["kcal"] == 195.0 and len(day["entries"]) == 1
    assert (await client.delete(f"/api/v1/me/meals/{eid}", headers=h)).status_code == 200


async def test_custom_foods_are_private(client):
    h = await _ready_user(client)
    mine = await client.post("/api/v1/me/foods", json={"name": "Arepa de mi abuela", "kcal": 210, "carbs_g": 40},
                             headers=h)
    assert mine.status_code == 201
    other = await _ready_user(client)
    assert not [f for f in (await client.get("/api/v1/me/foods", params={"q": "abuela"}, headers=other)).json()]
    r = await client.post("/api/v1/me/meals", json={"id": str(uuid.uuid4()), "meal": "snack",
                                                    "food_id": mine.json()["id"], "grams": 80}, headers=other)
    assert r.status_code == 404
    bad = await client.post("/api/v1/me/foods", json={"name": "Imposible", "kcal": 100, "protein_g": 60,
                                                      "carbs_g": 60}, headers=h)
    assert bad.status_code == 422


async def test_barcode_uses_open_food_facts_once(client, monkeypatch):
    h = await _ready_user(client)
    code = str(7700000000000 + uuid.uuid4().int % 99999)
    calls = []

    async def fake(c):
        calls.append(c)
        return foods.parse_off(c, {"status": 1, "product": {
            "product_name": "Avena molida", "brands": "Marca X", "serving_quantity": 30,
            "nutriments": {"energy-kcal_100g": 380, "proteins_100g": 13, "carbohydrates_100g": 65, "fat_100g": 7}}})

    monkeypatch.setattr(foods, "fetch_off", fake)
    r = await client.get(f"/api/v1/me/foods/barcode/{code}", headers=h)
    assert r.status_code == 200 and r.json()["kcal"] == 380 and r.json()["portions"][0]["grams"] == 30
    await client.get(f"/api/v1/me/foods/barcode/{code}", headers=h)
    assert calls == [code], "la segunda vez sale de la base, no de internet"

    async def nothing(c):
        return None

    monkeypatch.setattr(foods, "fetch_off", nothing)
    assert (await client.get("/api/v1/me/foods/barcode/7709999999999", headers=h)).status_code == 404


def test_open_food_facts_energy_in_kj_is_converted():
    food = foods.parse_off("12345678", {"status": 1, "product": {"product_name": "Galleta",
                                                                 "nutriments": {"energy_100g": 2092}}})
    assert food["kcal"] == 500.0
    assert foods.parse_off("12345678", {"status": 0}) is None


async def test_a_private_food_never_answers_someone_elses_scan(client, monkeypatch):
    h = await _ready_user(client)
    code = str(7701000000000 + uuid.uuid4().int % 99999)
    mine = await client.post("/api/v1/me/foods", json={"name": "Mi receta secreta", "kcal": 300, "barcode": code},
                             headers=h)
    assert mine.status_code == 201 and mine.json()["barcode"] is None

    async def nothing(c):
        return None

    monkeypatch.setattr(foods, "fetch_off", nothing)
    other = await _ready_user(client)
    assert (await client.get(f"/api/v1/me/foods/barcode/{code}", headers=other)).status_code == 404
