"""Planes: automáticos, con IA (Gemini simulado), fila, cuota y créditos."""
import uuid

import pytest

from app.core.config import settings
from app.db.app_db import app_session
from app.models.app import Food
from app.services import credits, plan_generator, plans
from tests.test_app_mobile import _app_login, _h
from sqlalchemy import select


async def _adult(client, birth="1990-03-03", ai=False, **extra):
    _, t = await _app_login(client)
    h = _h(t["access_token"])
    await client.post("/api/v1/me/consents", json={"kind": "health", "granted": True}, headers=h)
    if ai:
        await client.post("/api/v1/me/consents", json={"kind": "ai_plans", "granted": True}, headers=h)
    await client.patch("/api/v1/me", json={"birth_date": birth, "sex": "female", "height_cm": 165, "weight_kg": 62,
                                           "goal": "lose_fat", "activity_level": "light", **extra}, headers=h)
    return h


@pytest.fixture(autouse=True)
def no_background(monkeypatch):
    """La fila se procesa a mano en las pruebas (sin tareas sueltas en el loop)."""
    async def nothing():
        return None
    monkeypatch.setattr(plan_generator, "kick", nothing)


@pytest.fixture
def quota(monkeypatch):
    state = {"free": True}

    async def acquire():
        return state["free"]
    monkeypatch.setattr(plan_generator, "try_acquire", acquire)
    return state


@pytest.fixture
def gemini_key(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")


class FakeGemini:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    async def __call__(self, system, prompt, schema):
        self.calls.append({"system": system, "prompt": prompt, "schema": schema})
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def gen(kind="meals", engine="auto", **extra):
    body = {"id": str(uuid.uuid4()), "kind": kind, "engine": engine}
    body.update(extra)
    return body


async def test_auto_meal_plan_hits_the_target_with_real_foods(client):
    h = await _adult(client)
    target = (await client.get("/api/v1/me/nutrition/targets", headers=h)).json()["targets"]
    r = await client.post("/api/v1/me/plans/generate", json=gen(meals={"meals_per_day": 4}), headers=h)
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["status"] == "done" and job["engine"] == "auto"
    data = job["plan"]["data"]
    assert len(data["meals"]) == 4 and data["engine"] == "auto"
    assert abs(data["totals"]["kcal"] - target["kcal"]) <= 0.10 * target["kcal"]
    assert data["totals"]["protein_g"] >= 0.75 * target["protein_g"]
    item = data["meals"][0]["items"][0]
    assert item["food_id"] and item["grams"] > 0 and item["kcal"] > 0


async def test_restrictions_are_respected(client):
    h = await _adult(client)
    r = await client.post("/api/v1/me/plans/generate",
                          json=gen(meals={"meals_per_day": 3, "restrictions": ["vegetarian", "no_dairy"]}), headers=h)
    names = [i["food"].lower() for m in r.json()["plan"]["data"]["meals"] for i in m["items"]]
    assert not any(w in n for n in names for w in ("pollo", "res", "cerdo", "tilapia", "atún", "yogur", "queso"))


async def test_auto_training_plan_shapes(client):
    h = await _adult(client)
    for days in (2, 3, 4, 5, 6):
        r = await client.post("/api/v1/me/plans/generate", json=gen(
            kind="training", training={"days_per_week": days, "level": "intermediate", "place": "home",
                                       "minutes": 30, "focus": "hypertrophy"}), headers=h)
        data = r.json()["plan"]["data"]
        assert len(data["days"]) == days and all(len(d["exercises"]) == 4 for d in data["days"])
        assert data["days"][0]["exercises"][0]["reps"] in ("8-12", "30-45 s")


async def test_screening_and_age_block_plans(client):
    h = await _adult(client)
    r = await client.post("/api/v1/me/plans/generate", json=gen(screening={"eating_disorder": True}), headers=h)
    assert r.status_code == 422 and "192" in r.json()["detail"]
    r = await client.post("/api/v1/me/plans/generate", json=gen(kind="training", screening={"medical": True}), headers=h)
    assert r.status_code == 422 and "profesional" in r.json()["detail"]
    teen = await _adult(client, birth="2010-01-01")
    r = await client.post("/api/v1/me/plans/generate", json=gen(kind="training"), headers=teen)
    assert r.status_code == 422 and "18" in r.json()["detail"]


async def test_ai_needs_key_consent_and_credits(client, monkeypatch, quota):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    h = await _adult(client, ai=True)
    assert (await client.post("/api/v1/me/plans/generate", json=gen(engine="ai"), headers=h)).status_code == 503
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    no_consent = await _adult(client)
    assert (await client.post("/api/v1/me/plans/generate", json=gen(engine="ai"), headers=no_consent)).status_code == 403
    opts = (await client.get("/api/v1/me/plans/options", headers=h)).json()
    assert opts["ai_available"] and opts["ai_consent"]
    start = opts["credits"]["balance"]
    assert start == settings.plan_welcome_credits + settings.plan_free_weekly
    monkeypatch.setattr(plan_generator, "call_gemini", FakeGemini(*[plan_generator.ModelError("x")] * 20))
    for _ in range(start):
        r = await client.post("/api/v1/me/plans/generate", json=gen(kind="training", engine="ai"), headers=h)
        assert r.status_code == 202
    r = await client.post("/api/v1/me/plans/generate", json=gen(kind="training", engine="ai"), headers=h)
    assert r.status_code == 402


async def _meal_keys():
    async with app_session() as adb:
        rows = (await adb.execute(select(Food).where(Food.ref_key.in_(
            ["tcac_5", "huevo_entero", "papaya", "tcac_10", "pechuga_pollo_asada", "lechuga", "aceite_oliva_usda",
             "tilapia_cocida", "papa_cocida_usda"])))).scalars().all()
    return {f.ref_key: f for f in rows}


async def test_ai_meal_plan_is_recomputed_from_the_database(client, monkeypatch, gemini_key, quota):
    h = await _adult(client, ai=True)
    await _meal_keys()
    model_day = {"notes": "Día equilibrado.", "meals": [
        {"time": "07:00", "name": "Desayuno", "items": [{"ref_key": "tcac_5", "grams": 120}, {"ref_key": "huevo_entero", "grams": 100},
                                                        {"ref_key": "papaya", "grams": 150}]},
        {"time": "13:00", "name": "Almuerzo", "items": [{"ref_key": "tcac_10", "grams": 200}, {"ref_key": "pechuga_pollo_asada", "grams": 150},
                                                        {"ref_key": "lechuga", "grams": 60}, {"ref_key": "aceite_oliva_usda", "grams": 10}]},
        {"time": "19:30", "name": "Cena", "items": [{"ref_key": "tilapia_cocida", "grams": 150}, {"ref_key": "papa_cocida_usda", "grams": 200}]},
    ]}
    fake = FakeGemini(model_day)
    monkeypatch.setattr(plan_generator, "call_gemini", fake)
    r = await client.post("/api/v1/me/plans/generate", json=gen(engine="ai"), headers=h)
    assert r.status_code == 202 and r.json()["status"] == "queued" and r.json()["position"] >= 1
    await plan_generator.process_queue(job_ids=[uuid.UUID(r.json()['id'])])
    job = (await client.get(f"/api/v1/me/plans/jobs/{r.json()['id']}", headers=h)).json()
    assert job["status"] == "done" and job["engine"] == "ai", job
    data = job["plan"]["data"]
    target = data["targets"]["kcal"]
    assert abs(data["totals"]["kcal"] - target) <= 0.12 * target, "el servidor ajusta el día a la meta"
    sent = fake.calls[0]
    assert "Ana" not in sent["prompt"] and "@" not in sent["prompt"], "al proveedor no va nada que identifique"
    assert '"peso_kg_aprox": 60' in sent["prompt"] and '"edad": "30-39"' in sent["prompt"]
    assert sent["schema"]["properties"]["meals"]["items"]["properties"]["items"]["items"]["properties"]["ref_key"]["enum"]


async def test_invented_food_or_bad_output_falls_back_to_auto_and_refunds(client, monkeypatch, gemini_key, quota):
    h = await _adult(client, ai=True)
    bad = {"notes": "", "meals": [{"time": "07:00", "name": "D", "items": [{"ref_key": "pizza_inventada", "grams": 200}]},
                                  {"time": "13:00", "name": "A", "items": [{"ref_key": "otra", "grams": 300}]}]}
    monkeypatch.setattr(plan_generator, "call_gemini", FakeGemini(bad, plan_generator.ModelError("HTTP 500")))
    before = (await client.get("/api/v1/me/credits", headers=h)).json()["balance"]
    r = await client.post("/api/v1/me/plans/generate", json=gen(engine="ai"), headers=h)
    assert (await client.get("/api/v1/me/credits", headers=h)).json()["balance"] == before - 1
    await plan_generator.process_queue(job_ids=[uuid.UUID(r.json()['id'])])
    await plan_generator.process_queue(job_ids=[uuid.UUID(r.json()['id'])])
    job = (await client.get(f"/api/v1/me/plans/jobs/{r.json()['id']}", headers=h)).json()
    assert job["status"] == "done" and job["engine"] == "auto" and job["message"]
    after = (await client.get("/api/v1/me/credits", headers=h)).json()
    assert after["balance"] == before and after["history"][0]["kind"] == "refund"


async def test_full_quota_waits_in_line_and_429_requeues(client, monkeypatch, gemini_key, quota):
    h = await _adult(client, ai=True)
    plan = {"notes": "Fuerza básica.", "days": [
        {"weekday": d, "title": "Cuerpo completo", "exercises": [{"name": "Sentadilla", "sets": 3, "reps": "8-10", "rest_seconds": 120}]}
        for d in (0, 2, 4)]}
    fake = FakeGemini(plan_generator.QuotaFull(), plan)
    monkeypatch.setattr(plan_generator, "call_gemini", fake)
    quota["free"] = False
    r = await client.post("/api/v1/me/plans/generate", json=gen(kind="training", engine="ai"), headers=h)
    await plan_generator.process_queue(job_ids=[uuid.UUID(r.json()['id'])])
    assert (await client.get(f"/api/v1/me/plans/jobs/{r.json()['id']}", headers=h)).json()["status"] == "queued"
    assert not fake.calls, "sin cupo no se llama al proveedor"
    quota["free"] = True
    await plan_generator.process_queue(job_ids=[uuid.UUID(r.json()['id'])])
    assert (await client.get(f"/api/v1/me/plans/jobs/{r.json()['id']}", headers=h)).json()["status"] == "queued"
    await plan_generator.process_queue(job_ids=[uuid.UUID(r.json()['id'])])
    job = (await client.get(f"/api/v1/me/plans/jobs/{r.json()['id']}", headers=h)).json()
    assert job["status"] == "done" and job["engine"] == "ai" and len(job["plan"]["data"]["days"]) == 3


async def test_generate_is_idempotent_and_private(client, monkeypatch, gemini_key, quota):
    h = await _adult(client, ai=True)
    monkeypatch.setattr(plan_generator, "call_gemini", FakeGemini())
    body = gen(kind="training", engine="ai")
    before = (await client.get("/api/v1/me/credits", headers=h)).json()["balance"]
    await client.post("/api/v1/me/plans/generate", json=body, headers=h)
    again = await client.post("/api/v1/me/plans/generate", json=body, headers=h)
    assert again.status_code == 200 and again.json()["id"] == body["id"]
    assert (await client.get("/api/v1/me/credits", headers=h)).json()["balance"] == before - 1
    other = await _adult(client, ai=True)
    assert (await client.get(f"/api/v1/me/plans/jobs/{body['id']}", headers=other)).status_code == 404
    assert (await client.post("/api/v1/me/plans/generate", json=body, headers=other)).status_code == 409


async def test_edit_meal_plan_recomputes_and_rejects_foreign_foods(client):
    h = await _adult(client)
    plan = (await client.post("/api/v1/me/plans/generate", json=gen(meals={"meals_per_day": 3}), headers=h)).json()["plan"]
    data = plan["data"]
    data["meals"][0]["items"][0]["grams"] *= 2
    data["meals"][0]["items"][0]["kcal"] = 1
    r = await client.put(f"/api/v1/me/plans/{plan['id']}", json={"data": data}, headers=h)
    assert r.status_code == 200 and r.json()["data"]["meals"][0]["items"][0]["kcal"] > 1
    other = await _adult(client)
    mine = (await client.post("/api/v1/me/foods", json={"name": "Secreto", "kcal": 300}, headers=other)).json()
    data["meals"][0]["items"][0]["food_id"] = mine["id"]
    r = await client.put(f"/api/v1/me/plans/{plan['id']}", json={"data": data}, headers=h)
    assert r.status_code == 422


async def test_credit_grants_are_idempotent():
    uid = uuid.uuid4()
    async with app_session() as adb:
        b1 = await credits.balance(adb, uid)
        b2 = await credits.balance(adb, uid)
        await credits.spend(adb, uid, "job-1")
        await credits.spend(adb, uid, "job-1")
        await credits.refund(adb, uid, "job-1")
        await credits.refund(adb, uid, "job-1")
        await credits.refund(adb, uid, "never-spent")
        b3 = await credits.balance(adb, uid)
        await adb.commit()
    assert b1 == b2 == b3 == settings.plan_welcome_credits + settings.plan_free_weekly


def test_anonymous_profile_has_nothing_identifying():
    p = plans.Person(age=34, sex="female", goal="lose_fat", pace="moderate", activity="light", weight_kg=63.4,
                     height_cm=167, targets=None, min_kcal=1300, parq_flag=False)
    a = p.anonymous()
    assert a["edad"] == "30-39" and a["peso_kg_aprox"] == 65 and a["talla_cm_aprox"] == 165
    assert set(a) == {"edad", "sexo", "objetivo", "ritmo", "actividad", "peso_kg_aprox", "talla_cm_aprox", "metas",
                      "minimo_kcal", "parq_con_alertas"}
