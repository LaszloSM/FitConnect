"""Asistente: guardas, herramientas de planes y validación, con un modelo simulado."""
import uuid
from types import SimpleNamespace as NS

import pytest

from app.core.config import settings
from app.services import assistant
from tests.test_app_mobile import _app_login, _h


def text(t):
    return NS(stop_reason="end_turn", content=[NS(type="text", text=t)])


def tool(name, data):
    return NS(stop_reason="tool_use", content=[NS(type="text", text="Va el plan."),
                                               NS(type="tool_use", id=f"tu_{uuid.uuid4().hex[:8]}", name=name, input=data)])


class FakeModel:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    async def __call__(self, system, messages, tools):
        self.calls.append({"system": system, "messages": [dict(m) for m in messages], "tools": tools})
        return self.responses.pop(0)


@pytest.fixture
def api_key(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")


async def _adult(client, birth="1990-03-03", **extra):
    _, t = await _app_login(client)
    h = _h(t["access_token"])
    await client.post("/api/v1/me/consents", json={"kind": "health", "granted": True}, headers=h)
    await client.patch("/api/v1/me", json={"birth_date": birth, "sex": "female", "height_cm": 165, "weight_kg": 62,
                                           "goal": "lose_fat", "activity_level": "light", **extra}, headers=h)
    return h


MEALS_LOW = {"title": "Día ligero", "meals": [
    {"time": "07:00", "name": "Desayuno", "items": [{"food": "Huevo", "amount": "2 huevos", "kcal": 140}]},
    {"time": "13:00", "name": "Almuerzo", "items": [{"food": "Ensalada", "amount": "1 plato", "kcal": 200}]},
]}
MEALS_OK = {"title": "Día tipo", "meals": [
    {"time": "07:00", "name": "Desayuno", "items": [{"food": "Arepa con huevo", "amount": "1 + 2", "kcal": 420, "protein_g": 20}]},
    {"time": "13:00", "name": "Almuerzo", "items": [{"food": "Arroz, fríjol y pollo", "amount": "1 plato", "kcal": 700, "protein_g": 45}]},
    {"time": "19:30", "name": "Cena", "items": [{"food": "Pescado con papa", "amount": "1 plato", "kcal": 450, "protein_g": 35}]},
]}


async def test_not_available_without_key_or_for_minors(client, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    h = await _adult(client)
    state = (await client.get("/api/v1/me/assistant", headers=h)).json()
    assert state["available"] is False and state["reason"] == "off"
    assert (await client.post("/api/v1/me/assistant/messages", json={"text": "hola"}, headers=h)).status_code == 503
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    teen = await _adult(client, birth="2010-01-01")
    r = await client.post("/api/v1/me/assistant/messages", json={"text": "hola"}, headers=teen)
    assert r.status_code == 403


async def test_meal_plan_below_the_floor_is_sent_back_and_fixed(client, monkeypatch, api_key):
    h = await _adult(client)
    fake = FakeModel(tool("save_meal_plan", MEALS_LOW), tool("save_meal_plan", MEALS_OK), text("Te dejé un día tipo."))
    monkeypatch.setattr(assistant, "call_model", fake)
    r = await client.post("/api/v1/me/assistant/messages", json={"text": "Hazme un plan de comidas"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["plans"]) == 1 and body["plans"][0]["data"]["total_kcal"] == 1570
    rejected = fake.calls[1]["messages"][-1]["content"][0]
    assert rejected["is_error"] is True and "mínimo seguro" in rejected["content"]
    assert "Mínimo de calorías permitido" in fake.calls[0]["system"]
    plans = (await client.get("/api/v1/me/plans", headers=h)).json()
    assert [p["title"] for p in plans] == ["Día tipo"]
    convo = (await client.get("/api/v1/me/assistant", headers=h)).json()["messages"]
    assert [m["role"] for m in convo] == ["user", "assistant"] and convo[1]["plan_ids"] == [plans[0]["id"]]


async def test_crisis_gets_help_lines_without_calling_the_model(client, monkeypatch, api_key):
    h = await _adult(client)
    fake = FakeModel()
    monkeypatch.setattr(assistant, "call_model", fake)
    r = (await client.post("/api/v1/me/assistant/messages", json={"text": "Ya no quiero vivir"}, headers=h)).json()
    assert "123" in r["text"] and "192" in r["text"] and fake.calls == []


async def test_eating_disorder_signals_turn_off_plans(client, monkeypatch, api_key):
    h = await _adult(client)
    fake = FakeModel(text("Lo que cuentas es importante..."))
    monkeypatch.setattr(assistant, "call_model", fake)
    await client.post("/api/v1/me/assistant/messages", json={"text": "Quiero comer 600 calorías al día"}, headers=h)
    assert fake.calls[0]["tools"] == [] and "trastorno alimentario" in fake.calls[0]["system"]


async def test_training_plan_is_validated_and_editable(client, monkeypatch, api_key):
    h = await _adult(client)
    bad = {"title": "Fuerza", "days": [{"weekday": 0, "title": "Pierna", "exercises": [{"name": "Sentadilla", "sets": 15, "reps": "5"}]}]}
    good = {"title": "Fuerza 3 días", "days": [
        {"weekday": 0, "title": "Pierna", "exercises": [{"name": "Sentadilla", "sets": 3, "reps": "8-10", "rest_seconds": 120}]},
        {"weekday": 2, "title": "Empuje", "exercises": [{"name": "Press de banca", "sets": 3, "reps": "8-10"}]},
    ]}
    fake = FakeModel(tool("save_training_plan", bad), tool("save_training_plan", good), text("Listo."))
    monkeypatch.setattr(assistant, "call_model", fake)
    plan = (await client.post("/api/v1/me/assistant/messages", json={"text": "Plan de 3 días"}, headers=h)).json()["plans"][0]
    assert [d["weekday"] for d in plan["data"]["days"]] == [0, 2]

    broken = {"days": [{"weekday": 9, "title": "x", "exercises": [{"name": "a", "sets": 3, "reps": "8"}]}]}
    assert (await client.put(f"/api/v1/me/plans/{plan['id']}", json={"data": broken}, headers=h)).status_code == 422
    ok = await client.put(f"/api/v1/me/plans/{plan['id']}", json={"title": "Mi fuerza", "active": False}, headers=h)
    assert ok.json()["title"] == "Mi fuerza" and ok.json()["active"] is False
    other = await _adult(client)
    assert (await client.get(f"/api/v1/me/plans/{plan['id']}", headers=other)).status_code == 404
    assert (await client.delete(f"/api/v1/me/plans/{plan['id']}", headers=h)).status_code == 200


async def test_daily_limit(client, monkeypatch, api_key):
    h = await _adult(client)
    monkeypatch.setattr(settings, "assistant_daily_limit", 1)
    monkeypatch.setattr(assistant, "call_model", FakeModel(text("Hola")))
    assert (await client.post("/api/v1/me/assistant/messages", json={"text": "hola"}, headers=h)).status_code == 200
    assert (await client.post("/api/v1/me/assistant/messages", json={"text": "otra"}, headers=h)).status_code == 429


async def test_model_failure_does_not_leave_half_a_conversation(client, monkeypatch, api_key):
    h = await _adult(client)

    async def boom(*a):
        raise RuntimeError("API caída")

    monkeypatch.setattr(assistant, "call_model", boom)
    assert (await client.post("/api/v1/me/assistant/messages", json={"text": "hola"}, headers=h)).status_code == 502
    assert (await client.get("/api/v1/me/assistant", headers=h)).json()["messages"] == []


def test_screen_ignores_accents_and_case():
    assert assistant.screen("Me provoqué el VÓMITO… quiero PURGARME") == "eating"
    assert assistant.screen("Tengo DOLOR EN EL PECHO al correr") == "medical"
    assert assistant.screen("Quiero ganar músculo") is None
