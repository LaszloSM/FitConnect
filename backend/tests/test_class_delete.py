"""Borrar una clase con horario devolvia 500.

`class_sessions.gym_class_id` y `class_enrollments.gym_class_id` son FKs sin
cascada, y el endpoint hacia un borrado fisico: como toda clase con weekdays +
start_time materializa sesiones, practicamente CUALQUIER clase reventaba al
intentar eliminarla. En el navegador ni siquiera se veia el 500: la excepcion
sube por debajo del middleware de CORS, asi que el error que llega es
"blocked by CORS policy" y apunta al sitio equivocado.

Mismo criterio que maquinas y socios: lo que tiene historia de gente se retira.
"""
import uuid
from datetime import timedelta

from app.core.timeutil import today_bogota
from tests.helpers import create_member_without_membership

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="classdelete@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Borrado", "gym_name": "Borrado Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _create_class(client, token, **overrides):
    payload = {
        "name": f"Clase {uuid.uuid4().hex[:6]}", "instructor": "Ana",
        "max_capacity": 10, "duration_minutes": 60,
    }
    payload.update(overrides)
    r = await client.post("/api/v1/classes", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_una_clase_con_horario_se_borra_sin_reventar(client):
    """El caso que daba 500: la clase materializa sesiones al crearse."""
    token = await _owner_token(client)
    manana = (today_bogota() + timedelta(days=1)).weekday()
    class_id = await _create_class(client, token, weekdays=[manana], start_time="08:00:00")

    sesiones = (await client.get("/api/v1/class-sessions", headers=_auth(token))).json()
    assert any(s["gym_class_id"] == class_id for s in sesiones), "no se materializó ninguna sesión"

    r = await client.delete(f"/api/v1/classes/{class_id}", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["archived"] is False

    restantes = (await client.get("/api/v1/classes", headers=_auth(token))).json()
    assert class_id not in [c["id"] for c in restantes]


async def test_una_clase_sin_horario_tambien_se_borra(client):
    token = await _owner_token(client)
    class_id = await _create_class(client, token)
    r = await client.delete(f"/api/v1/classes/{class_id}", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["archived"] is False


async def test_una_clase_con_inscritos_se_archiva_en_vez_de_borrarse(client):
    """Hay socios apuntados: la clase deja de dictarse pero no se destruye."""
    token = await _owner_token(client)
    class_id = await _create_class(client, token)
    member = await create_member_without_membership(client, _auth(token), full_name="Inscrito")

    r = await client.post(f"/api/v1/classes/{class_id}/enroll",
                          json={"member_id": member["id"]}, headers=_auth(token))
    assert r.status_code == 201, r.text

    r = await client.delete(f"/api/v1/classes/{class_id}", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["archived"] is True
    assert r.json()["enrollments"] == 1

    # Sigue existiendo, inactiva: la inscripción del socio no se pierde.
    detalle = (await client.get(f"/api/v1/classes/{class_id}", headers=_auth(token))).json()
    assert detalle["is_active"] is False


async def test_borrar_una_clase_inexistente_es_404(client):
    token = await _owner_token(client)
    r = await client.delete(f"/api/v1/classes/{uuid.uuid4()}", headers=_auth(token))
    assert r.status_code == 404, r.text
