"""Agua, racha y registro rápido de la app."""
import uuid
from datetime import date, timedelta

from app.api.v1.me_nutrition import streaks
from app.core.timeutil import today_bogota
from tests.test_app_mobile import _app_login, _h
from tests.test_app_nutrition import _ready_user


async def test_water_is_idempotent_and_can_be_undone(client):
    h = await _ready_user(client)
    glass = str(uuid.uuid4())
    first = (await client.post("/api/v1/me/water", json={"id": glass}, headers=h)).json()
    assert first["total_ml"] == 250 and len(first["entries"]) == 1
    again = (await client.post("/api/v1/me/water", json={"id": glass}, headers=h)).json()
    assert again["total_ml"] == 250
    second = (await client.post("/api/v1/me/water", json={"id": str(uuid.uuid4()), "ml": 500}, headers=h)).json()
    assert second["total_ml"] == 750
    undone = (await client.delete(f"/api/v1/me/water/{glass}", headers=h)).json()
    assert undone["total_ml"] == 500


async def test_water_goal_follows_weight_until_the_person_sets_one(client):
    h = await _ready_user(client)  # 80 kg con autorización de salud
    assert (await client.get("/api/v1/me/water", headers=h)).json()["goal_ml"] == 2750
    r = (await client.put("/api/v1/me/water/goal", json={"goal_ml": 2000}, headers=h)).json()
    assert r["goal_ml"] == 2000
    r = (await client.put("/api/v1/me/water/goal", json={"goal_ml": None}, headers=h)).json()
    assert r["goal_ml"] == 2750


async def test_water_without_health_consent_uses_the_default_goal(client):
    _, t = await _app_login(client)
    h = _h(t["access_token"])
    assert (await client.get("/api/v1/me/water", headers=h)).json()["goal_ml"] == 2000


async def test_water_is_private(client):
    h1 = await _ready_user(client)
    _, t2 = await _app_login(client)
    h2 = _h(t2["access_token"])
    glass = str(uuid.uuid4())
    await client.post("/api/v1/me/water", json={"id": glass}, headers=h1)
    assert (await client.post("/api/v1/me/water", json={"id": glass}, headers=h2)).status_code == 409
    assert (await client.delete(f"/api/v1/me/water/{glass}", headers=h2)).status_code == 404
    assert (await client.get("/api/v1/me/water", headers=h2)).json()["total_ml"] == 0


async def test_quick_add_counts_in_the_day_and_the_week(client):
    h = await _ready_user(client)
    eid = str(uuid.uuid4())
    body = {"id": eid, "meal": "snack", "kcal": 320, "protein_g": 12, "label": "Empanada de la esquina"}
    r = (await client.post("/api/v1/me/meals", json=body, headers=h)).json()
    assert r["status"] == "created"
    assert r["entry"]["food_id"] is None and r["entry"]["food_name"] == "Empanada de la esquina"
    assert r["entry"]["kcal"] == 320 and r["entry"]["grams"] == 0
    assert (await client.post("/api/v1/me/meals", json=body, headers=h)).json()["status"] == "duplicate"
    day = (await client.get("/api/v1/me/meals", headers=h)).json()
    assert day["totals"]["kcal"] == 320 and day["totals"]["protein_g"] == 12
    week = (await client.get("/api/v1/me/nutrition/week", headers=h)).json()
    assert week["days"][-1]["kcal"] == 320
    # Sin gramos no hay nada que reescalar; sí se puede mover de comida.
    assert (await client.patch(f"/api/v1/me/meals/{eid}", json={"grams": 100}, headers=h)).status_code == 422
    assert (await client.patch(f"/api/v1/me/meals/{eid}", json={"meal": "dinner"}, headers=h)).status_code == 200


async def test_quick_add_without_label_and_bad_payloads(client):
    h = await _ready_user(client)
    r = (await client.post("/api/v1/me/meals", json={"id": str(uuid.uuid4()), "meal": "lunch", "kcal": 500},
                           headers=h)).json()
    assert r["entry"]["food_name"] == "Registro rápido"
    nothing = {"id": str(uuid.uuid4()), "meal": "lunch"}
    assert (await client.post("/api/v1/me/meals", json=nothing, headers=h)).status_code == 422
    rice = (await client.get("/api/v1/me/foods", params={"q": "arroz"}, headers=h)).json()[0]
    both = {"id": str(uuid.uuid4()), "meal": "lunch", "food_id": rice["id"], "grams": 100, "kcal": 10}
    assert (await client.post("/api/v1/me/meals", json=both, headers=h)).status_code == 422
    no_grams = {"id": str(uuid.uuid4()), "meal": "lunch", "food_id": rice["id"]}
    assert (await client.post("/api/v1/me/meals", json=no_grams, headers=h)).status_code == 422


async def test_streak_endpoint_counts_logged_days(client):
    h = await _ready_user(client)
    today = today_bogota()
    for back in (0, 1, 2, 4):
        await client.post("/api/v1/me/meals", json={"id": str(uuid.uuid4()), "meal": "lunch", "kcal": 400,
                                                     "day": (today - timedelta(days=back)).isoformat()}, headers=h)
    r = (await client.get("/api/v1/me/streak", headers=h)).json()
    assert r["current"] == 3 and r["best"] == 3 and r["today_logged"] is True
    assert len(r["week"]) == 7 and r["week"][-1] == {"day": today.isoformat(), "logged": True}
    assert r["week"][-4]["logged"] is False


def test_streak_rules():
    today = date(2026, 10, 11)
    d = lambda n: today - timedelta(days=n)  # noqa: E731
    # Hoy sin registro todavía: la racha sigue viva hasta ayer.
    assert streaks({d(1), d(2), d(3)}, today)["current"] == 3
    assert streaks({d(1), d(2), d(3)}, today)["today_logged"] is False
    # Un día perdido reinicia la actual pero no la mejor.
    s = streaks({d(0), d(2), d(3), d(4), d(5), d(6)}, today)
    assert s["current"] == 1 and s["best"] == 5
    assert streaks(set(), today) == {"current": 0, "best": 0, "today_logged": False,
                                     "week": streaks(set(), today)["week"]}
    assert streaks({d(2)}, today)["current"] == 0
