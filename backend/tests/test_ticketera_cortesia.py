"""Ticketeras (planes por número de entradas) y cortesías para socios."""
import uuid

from tests.helpers import create_member, create_plan

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="ticketera@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Ticketera", "gym_name": "Ticketera Gym", "city": "Cali",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS[email] = r.json()["access_token"]
    return _TOKENS[email]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _cedula():
    return str(1000000000 + uuid.uuid4().int % 899999999)


async def _turnstile(client, h):
    r = await client.post("/api/v1/kiosk/devices", json={
        "name": f"Torniquete {uuid.uuid4().hex[:4]}", "kind": "turnstile"}, headers=h)
    assert r.status_code == 201, r.text
    return _auth(r.json()["token"])


async def _tenant_sql(token: str, sql: str):
    """Correr SQL en la base del gym del token (para mover el reloj en pruebas)."""
    from sqlalchemy import text
    from app.core.config import settings
    from app.core.security import decode_token
    from app.db.tenant_session import get_tenant_engine
    db_name = decode_token(token)["db_name"]
    engine = get_tenant_engine(settings.tenant_database_url_template.replace("{db_name}", db_name))
    async with engine.begin() as conn:
        await conn.execute(text(sql))


async def test_ticketera_discounts_entries_and_denies_when_exhausted(client):
    token = await _owner_token(client)
    h = _auth(token)
    plan_id = await create_plan(client, h, duration_days=30, entries_total=2)
    member = await create_member(client, h, plan_id=plan_id, id_number=_cedula())
    dh = await _turnstile(client, h)

    ms = (await client.get(f"/api/v1/members/{member['id']}/memberships", headers=h)).json()
    assert ms[0]["entries_total"] == 2 and ms[0]["entries_used"] == 0

    for expected_used in (1, 2):
        r = (await client.post("/api/v1/access/verify", json={"id_number": member["id_number"]}, headers=dh)).json()
        assert r["allow"] is True and r["decision"] == "allowed", r
        # Dos marcaciones seguidas son el mismo ingreso: se corre el reloj una hora.
        await _tenant_sql(token, "UPDATE checkins SET created_at = created_at - interval '1 hour'")
        ms = (await client.get(f"/api/v1/members/{member['id']}/memberships", headers=h)).json()
        assert ms[0]["entries_used"] == expected_used

    r = (await client.post("/api/v1/access/verify", json={"id_number": member["id_number"]}, headers=dh)).json()
    assert r["allow"] is False and r["reason"] == "no_entries"
    assert "entradas" in r["message"]


async def test_courtesy_gives_access_without_money_and_requires_admin(client):
    h = _auth(await _owner_token(client))
    member = await create_member(client, h, id_number=_cedula())
    ms = (await client.get(f"/api/v1/members/{member['id']}/memberships", headers=h)).json()
    for m in ms:
        await client.post(f"/api/v1/memberships/{m['id']}/cancel", headers=h)

    r = await client.post("/api/v1/member-plans/courtesy", json={
        "member_id": member["id"], "days": 7, "reason": "Semana de prueba"}, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["source"] == "courtesy" and float(body["price"]) == 0 and body["plan_name"] == "Cortesía"

    dh = await _turnstile(client, h)
    v = (await client.post("/api/v1/access/verify", json={"id_number": member["id_number"]}, headers=dh)).json()
    assert v["allow"] is True

    bad = await client.post("/api/v1/member-plans/courtesy", json={
        "member_id": member["id"], "days": 7, "reason": ""}, headers=h)
    assert bad.status_code == 422
