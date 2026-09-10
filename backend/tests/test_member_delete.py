"""Borrado de socios.

Todo socio nace con una membresía (plan_id es obligatorio en el alta), y
`memberships.member_id` es una FK sin cascada: borrar CUALQUIER socio desde la UI
devolvía 500 con un ForeignKeyViolation. Además, un socio con pagos no debe poder
borrarse nunca: el historial de caja se conserva.
"""
import uuid

from tests.helpers import create_plan, full_member_fields

_TOKENS: dict[str, str] = {}
_PLAN_IDS: dict[str, str] = {}


async def _owner_token(client, email="borrado@gym.com"):
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


async def _crear_socio(client, token):
    if token not in _PLAN_IDS:
        _PLAN_IDS[token] = await create_plan(client, _auth(token))
    payload = full_member_fields(
        full_name="Socio Borrable",
        email=f"d-{uuid.uuid4().hex[:10]}@test.com",
        id_number=str(uuid.uuid4().int)[:10],
        plan_id=_PLAN_IDS[token],
    )
    r = await client.post("/api/v1/members", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_borrar_socio_con_membresia_funciona(client):
    """Antes: 500 por la FK de memberships. Ahora: 204."""
    token = await _owner_token(client)
    member_id = await _crear_socio(client, token)

    r = await client.delete(f"/api/v1/members/{member_id}", headers=_auth(token))
    assert r.status_code == 204, r.text

    r = await client.get(f"/api/v1/members/{member_id}", headers=_auth(token))
    assert r.status_code == 404


async def test_socio_con_pagos_no_se_borra(client):
    """El historial de caja se conserva: 409 con instrucción, nunca un 500."""
    token = await _owner_token(client)
    # Sin turnos de caja, para poder cobrar directo
    await client.patch(
        "/api/v1/settings/operations", json={"cash_shifts_enabled": False}, headers=_auth(token)
    )
    member_id = await _crear_socio(client, token)

    r = await client.post("/api/v1/payments", headers=_auth(token), json={
        "member_id": member_id, "amount": 50000, "method": "cash",
        "status": "paid", "concept": "Mensualidad",
    })
    assert r.status_code == 201, r.text

    r = await client.delete(f"/api/v1/members/{member_id}", headers=_auth(token))
    assert r.status_code == 409, r.text
    assert "desactívalo" in r.json()["detail"]

    # Y el socio sigue ahí, con su pago
    r = await client.get(f"/api/v1/members/{member_id}", headers=_auth(token))
    assert r.status_code == 200


async def test_visitante_con_pase_no_se_borra(client):
    """Los pases del día llevan precio: también son historial de caja."""
    token = await _owner_token(client)
    await client.patch(
        "/api/v1/settings/operations", json={"cash_shifts_enabled": False}, headers=_auth(token)
    )
    r = await client.post("/api/v1/day-passes/types", headers=_auth(token), json={
        "name": f"Pase día {uuid.uuid4().hex[:6]}", "price": 15000, "duration_hours": 24,
    })
    assert r.status_code in (200, 201), r.text
    tipo_id = r.json()["id"]

    cedula = str(uuid.uuid4().int)[:10]
    r = await client.post("/api/v1/day-passes/sell", headers=_auth(token), json={
        "pass_type_id": tipo_id, "full_name": "Visitante Pase", "id_number": cedula,
        "method": "cash",
    })
    assert r.status_code in (200, 201), r.text

    r = await client.get(f"/api/v1/members?id_number={cedula}", headers=_auth(token))
    visitantes = r.json()
    assert visitantes, "la venta del pase debe crear el visitante"

    r = await client.delete(f"/api/v1/members/{visitantes[0]['id']}", headers=_auth(token))
    assert r.status_code == 409, r.text
