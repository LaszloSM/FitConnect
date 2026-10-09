"""Base de alimentos y lo que la persona hace con ella: buscar sin tildes, crear
por porción de etiqueta, recetas, favoritos, repetir comidas y semana."""
import json
import subprocess
import sys
import uuid
from datetime import timedelta
from pathlib import Path

from app.core.timeutil import today_bogota
from app.services import foods, nutrition
from tests.test_app_nutrition import _ready_user

BACKEND = Path(__file__).resolve().parent.parent


def test_reference_json_is_built_from_the_sources():
    """El JSON versionado sale de `build_foods.py`: nadie lo edita a mano."""
    r = subprocess.run([sys.executable, "scripts/build_foods.py", "--check"], cwd=BACKEND, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_reference_data_is_consistent():
    data = json.loads(foods.REFERENCE.read_text(encoding="utf-8"))
    rows = data["foods"]
    assert data["version"] >= 2 and len(rows) > 700
    keys = [f["ref_key"] for f in rows]
    assert len(keys) == len(set(keys))
    for f in rows:
        assert f["category"] in foods.CATEGORIES, f["ref_key"]
        assert set(f["nutrients"]) <= set(foods.NUTRIENT_KEYS), f["ref_key"]
        assert all(v is not None for v in f["nutrients"].values()), "sin dato se omite, nunca se guarda null"
        assert any(p["label"] == "100 g" for p in f["portions"])
        if f["origin"].startswith("ICBF"):
            est = 4 * f["protein_g"] + 4 * f["carbs_g"] + 9 * f["fat_g"]
            assert abs(est - f["kcal"]) <= max(25, 0.15 * f["kcal"]), f["name"]
    names = {f["name"] for f in rows}
    assert {"Arepa de maíz blanco, con sal", "Bandeja paisa", "Ajiaco santafereño", "Proteína de suero (whey) en polvo"} <= names


def test_normalize_and_recipe_math():
    assert foods.normalize("  Fríjol   ROJO, cocido ") == "frijol rojo cocido"
    a = foods.Food(name="A", kcal=100, protein_g=10, carbs_g=0, fat_g=0, fiber_g=0, nutrients={"iron_mg": 1.0})
    b = foods.Food(name="B", kcal=300, protein_g=0, carbs_g=50, fat_g=10, fiber_g=2, nutrients={})
    r = foods.recipe_per100([(a, 100), (b, 100)])
    assert r["kcal"] == 200 and r["protein_g"] == 5 and r["total_grams"] == 200
    assert "iron_mg" not in r["nutrients"], "si un ingrediente no trae el dato, la receta tampoco"


async def test_search_ignores_accents_and_uses_synonyms(client):
    h = await _ready_user(client)
    hits = (await client.get("/api/v1/me/foods", params={"q": "platano maduro"}, headers=h)).json()
    assert any("Plátano" in f["name"] for f in hits)
    hits = (await client.get("/api/v1/me/foods", params={"q": "guineo"}, headers=h)).json()
    assert any("Banano" in f["name"] for f in hits)
    cats = (await client.get("/api/v1/me/foods/categories", headers=h)).json()
    assert {"key": "platos", "label": "Platos colombianos"} in cats
    platos = (await client.get("/api/v1/me/foods", params={"category": "platos", "q": "ajiaco"}, headers=h)).json()
    assert platos and platos[0]["origin"].startswith("Estimado por receta")


async def test_empty_search_shows_everyday_foods_first(client):
    """Antes de escribir se ve lo que se come a diario (arepa, arroz), no el abecedario."""
    h = await _ready_user(client)
    names = [f["name"] for f in (await client.get("/api/v1/me/foods", params={"q": ""}, headers=h)).json()]
    assert names[:2] == ["Arepa de maíz blanco, con sal", "Arroz blanco, cocido"]
    assert "Achiote" not in names and "Cerveza" not in names


async def test_custom_food_from_a_label_serving(client):
    h = await _ready_user(client)
    body = {"name": "Barra de proteína X", "basis": "serving", "serving_grams": 40, "serving_label": "1 barra",
            "kcal": 160, "protein_g": 12, "carbs_g": 18, "fat_g": 5, "nutrients": {"sodium_mg": 80, "sugars_g": 6}}
    r = await client.post("/api/v1/me/foods", json=body, headers=h)
    assert r.status_code == 201, r.text
    f = r.json()
    assert f["kcal"] == 400 and f["protein_g"] == 30 and f["nutrients"] == {"sugars_g": 15.0, "sodium_mg": 200.0}
    assert f["portions"][0] == {"label": "1 barra", "grams": 40} and f["warning"] is None
    odd = await client.post("/api/v1/me/foods", json={"name": "Raro", "kcal": 500, "protein_g": 10}, headers=h)
    assert odd.status_code == 201 and "no cuadran" in odd.json()["warning"]
    missing = await client.post("/api/v1/me/foods", json={**body, "serving_grams": None}, headers=h)
    assert missing.status_code == 422
    upd = await client.put(f"/api/v1/me/foods/{f['id']}", json={**body, "kcal": 180}, headers=h)
    assert upd.status_code == 200 and upd.json()["kcal"] == 450
    other = await _ready_user(client)
    assert (await client.put(f"/api/v1/me/foods/{f['id']}", json=body, headers=other)).status_code == 404
    assert (await client.delete(f"/api/v1/me/foods/{f['id']}", headers=other)).status_code == 404
    assert (await client.delete(f"/api/v1/me/foods/{f['id']}", headers=h)).status_code == 200


async def _food(client, h, q, name):
    return next(f for f in (await client.get("/api/v1/me/foods", params={"q": q}, headers=h)).json() if f["name"] == name)


async def test_recipe_adds_up_its_ingredients(client):
    h = await _ready_user(client)
    rice = await _food(client, h, "arroz blanco cocido", "Arroz blanco, cocido")
    chicken = await _food(client, h, "pechuga pollo asada", "Pechuga de pollo sin piel, asada")
    r = await client.post("/api/v1/me/recipes", json={"name": "Mi almuerzo", "servings": 2, "items": [
        {"food_id": rice["id"], "grams": 300}, {"food_id": chicken["id"], "grams": 200}]}, headers=h)
    assert r.status_code == 201, r.text
    rec = r.json()
    expected = (153 * 3 + 165 * 2) / 5
    assert abs(rec["kcal"] - expected) < 0.2 and rec["portions"][0] == {"label": "1 porción", "grams": 250.0}
    assert len(rec["components"]) == 2 and rec["mine"] is True
    self_ref = await client.put(f"/api/v1/me/recipes/{rec['id']}", json={"name": "x", "items": [
        {"food_id": rec["id"], "grams": 10}]}, headers=h)
    assert self_ref.status_code == 422


async def test_favorites_recent_and_repeat_yesterday(client):
    h = await _ready_user(client)
    egg = await _food(client, h, "huevo entero", "Huevo de gallina entero, crudo")
    assert (await client.post(f"/api/v1/me/foods/{egg['id']}/favorite", headers=h)).status_code == 200
    assert (await client.post(f"/api/v1/me/foods/{egg['id']}/favorite", headers=h)).status_code == 200
    yesterday = today_bogota() - timedelta(days=1)
    for meal in ("breakfast", "dinner"):
        await client.post("/api/v1/me/meals", json={"id": str(uuid.uuid4()), "day": yesterday.isoformat(),
                                                    "meal": meal, "food_id": egg["id"], "grams": 100}, headers=h)
    rf = (await client.get("/api/v1/me/foods/recent", headers=h)).json()
    assert rf["recent"][0]["id"] == egg["id"] and rf["favorites"][0]["favorite"] is True
    ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    body = {"from_day": yesterday.isoformat(), "ids": ids}
    first = await client.post("/api/v1/me/meals/copy", json=body, headers=h)
    assert first.status_code == 200 and len(first.json()["entries"]) == 2
    again = await client.post("/api/v1/me/meals/copy", json=body, headers=h)
    assert [e["id"] for e in again.json()["entries"]] == ids, "reintentar no duplica"
    today = (await client.get("/api/v1/me/meals", headers=h)).json()
    assert len(today["entries"]) == 2 and today["totals"]["kcal"] == 286.0
    edited = await client.patch(f"/api/v1/me/meals/{ids[0]}", json={"grams": 50}, headers=h)
    assert edited.json()["kcal"] == 71.5
    week = (await client.get("/api/v1/me/nutrition/week", headers=h)).json()
    assert len(week["days"]) == 7 and week["days"][-1]["kcal"] == 214.5 and week["target"]["kcal"] > 0
    assert (await client.delete(f"/api/v1/me/foods/{egg['id']}/favorite", headers=h)).json() == {"favorite": False}


async def test_pace_changes_the_target_but_never_below_the_floor(client):
    h = await _ready_user(client)
    await client.patch("/api/v1/me", json={"goal": "lose_fat", "pace": "gentle"}, headers=h)
    gentle = (await client.get("/api/v1/me/nutrition/targets", headers=h)).json()["targets"]
    await client.patch("/api/v1/me", json={"pace": "aggressive"}, headers=h)
    fast = (await client.get("/api/v1/me/nutrition/targets", headers=h)).json()["targets"]
    assert fast["kcal"] < gentle["kcal"] and fast["kcal"] >= fast["bmr"]
    assert fast["weekly_change_kg"] < gentle["weekly_change_kg"] < 0
    assert fast["micro"]["sodium_mg"] == {"value": 2000, "kind": "max"} and fast["fiber_g"] > 0


def test_floor_holds_for_every_pace():
    from datetime import date
    for pace in ("gentle", "moderate", "aggressive"):
        t = nutrition.compute(sex="female", weight_kg=50, height_cm=150, birth_date=date(1960, 1, 1),
                              activity="sedentary", goal="lose_fat", today=date(2026, 10, 9), pace=pace)
        assert t.kcal >= max(nutrition.CALORIE_FLOOR["female"], t.bmr)


async def test_weight_history_is_health_data(client):
    h = await _ready_user(client)
    await client.patch("/api/v1/me", json={"weight_kg": 79.4}, headers=h)
    pts = (await client.get("/api/v1/me/weight", headers=h)).json()["points"]
    assert pts[-1]["weight_kg"] == 79.4 and len(pts) == 1
    await client.post("/api/v1/me/consents", json={"kind": "health", "granted": False}, headers=h)
    assert (await client.get("/api/v1/me/weight", headers=h)).json() == {"available": False, "points": []}
    await client.post("/api/v1/me/consents", json={"kind": "health", "granted": True}, headers=h)
    assert (await client.get("/api/v1/me/weight", headers=h)).json()["points"] == []
