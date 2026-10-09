"""Ajuste de porciones: el plan automático cumple calorías y macros a la vez."""
import uuid
from datetime import date, timedelta

import pytest

from app.db.app_db import app_session
from app.services import auto_plans, plans

TARGETS = [
    {"kcal": 1441, "protein_g": 124, "fat_g": 40, "carbs_g": 146},
    {"kcal": 2300, "protein_g": 133, "fat_g": 70, "carbs_g": 280},
    {"kcal": 3000, "protein_g": 150, "fat_g": 90, "carbs_g": 390},
]


#: Usuarios fijos: el plan rota alimentos según usuario y fecha, y la prueba
#: tiene que ver siempre las mismas combinaciones.
USERS = [uuid.UUID(int=i) for i in range(1, 5)]


async def _plan(adb, t, n, restrictions=(), day=date(2026, 10, 1), user=USERS[0]):
    draft = await auto_plans.meal_plan(adb, user, t, n, list(restrictions), day)
    allowed = await plans.foods_by_ids(adb, None, [i["food_id"] for m in draft["meals"] for i in m["items"]])
    return plans.validate_meals(draft, 1200, allowed)


@pytest.mark.parametrize("t", TARGETS, ids=lambda t: f"{t['kcal']}kcal")
@pytest.mark.parametrize("n", [3, 4, 5])
async def test_auto_plan_meets_calories_and_macros(client, t, n):
    async with app_session() as adb:
        for d, user in enumerate(USERS):
            tot = (await _plan(adb, t, n, day=date(2026, 10, 1) + timedelta(days=d), user=user))["totals"]
            assert abs(tot["kcal"] - t["kcal"]) <= 0.08 * t["kcal"]
            assert abs(tot["protein_g"] - t["protein_g"]) <= 0.10 * t["protein_g"]
            assert abs(tot["fat_g"] - t["fat_g"]) <= 0.25 * t["fat_g"]


async def test_portions_stay_reasonable(client):
    """Nada de 310 g de queso al desayuno ni medio kilo de huevo."""
    async with app_session() as adb:
        for t in TARGETS:
            for d, user in enumerate(USERS):
                p = await _plan(adb, t, 4, day=date(2026, 10, 1) + timedelta(days=d), user=user)
                for m in p["meals"]:
                    for i in m["items"]:
                        if "Huevo" in i["food"]:
                            assert i["grams"] <= 150 and i["grams"] % 50 == 0
                        if "Queso mozzarella" in i["food"]:
                            assert i["grams"] <= 60
                        assert i["grams"] <= 600


async def test_vegetarian_plan_says_when_protein_falls_short(client):
    """Si no se llega a la proteína, el plan lo dice en vez de esconderlo."""
    t = {"kcal": 1441, "protein_g": 124, "fat_g": 40, "carbs_g": 146}
    async with app_session() as adb:
        for d in range(6):
            p = await _plan(adb, t, 4, ["vegetarian"], date(2026, 10, 1) + timedelta(days=d))
            short = p["totals"]["protein_g"] < 0.9 * t["protein_g"]
            assert ("la proteína llega a" in (p["notes"] or "")) == short
            for m in p["meals"]:
                assert not any(w in i["food"] for i in m["items"] for w in ("Pollo", "pollo", "Res", "Tilapia", "Atún", "cerdo"))
