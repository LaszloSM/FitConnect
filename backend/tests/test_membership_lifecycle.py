import uuid
from datetime import date, datetime, timedelta
from app.core.timeutil import today_bogota
from zoneinfo import ZoneInfo

from tests.helpers import create_member_without_membership


def _today_bogota() -> date:
    return datetime.now(ZoneInfo("America/Bogota")).date()


# Cache de tokens por email: evita golpear el rate limit de /auth con un
# register+login por test. El JWT es un string reutilizable entre event loops.
_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="lifecycle@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Lifecycle", "gym_name": "Lifecycle Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _create_member(client, token):
    member = await create_member_without_membership(client, _auth(token), full_name="Miembro Prueba")
    return member["id"]


async def _create_plan(client, token, price=100000.0, duration_days=30):
    r = await client.post("/api/v1/member-plans/", json={
        "name": f"Plan {uuid.uuid4().hex[:6]}",
        "price": price,
        "duration_days": duration_days,
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def _assign(client, token, member_id, plan_id, start: date, **extra):
    r = await client.post("/api/v1/member-plans/assign", json={
        "member_id": member_id,
        "plan_id": plan_id,
        "start_date": start.isoformat(),
        **extra,
    }, headers=_auth(token))
    return r


# ─── Freeze / Unfreeze ───────────────────────────────────────────────────────

async def test_freeze_and_unfreeze_roundtrip(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token)
    membership = (await _assign(client, token, member_id, plan_id, today_bogota())).json()
    original_end = membership["end_date"]

    r = await client.post(f"/api/v1/memberships/{membership['id']}/freeze",
                          json={"reason": "vacaciones"}, headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["effective_status"] == "frozen"

    r = await client.post(f"/api/v1/memberships/{membership['id']}/unfreeze",
                          json={}, headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["effective_status"] == "active"
    # Congelar y descongelar el mismo día no corre la fecha
    assert body["end_date"] == original_end

    freezes = (await client.get(
        f"/api/v1/memberships/{membership['id']}/freezes", headers=_auth(token)
    )).json()
    assert len(freezes) == 1
    assert freezes[0]["days_applied"] == 0


async def test_double_freeze_rejected(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token)
    membership = (await _assign(client, token, member_id, plan_id, today_bogota())).json()

    r1 = await client.post(f"/api/v1/memberships/{membership['id']}/freeze",
                           json={}, headers=_auth(token))
    assert r1.status_code == 200
    r2 = await client.post(f"/api/v1/memberships/{membership['id']}/freeze",
                           json={}, headers=_auth(token))
    assert r2.status_code == 400


async def test_cancelled_membership_cannot_freeze(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token)
    membership = (await _assign(client, token, member_id, plan_id, today_bogota())).json()

    r = await client.post(f"/api/v1/memberships/{membership['id']}/cancel", headers=_auth(token))
    assert r.status_code == 200
    r = await client.post(f"/api/v1/memberships/{membership['id']}/freeze",
                          json={}, headers=_auth(token))
    assert r.status_code == 400


# ─── Encadenamiento y solapes (bug: "duplicación" al asignar/descongelar) ───

async def test_assign_chains_after_active_membership(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, duration_days=30)
    today = _today_bogota()

    first = (await _assign(client, token, member_id, plan_id, today)).json()
    second = (await _assign(client, token, member_id, plan_id, today)).json()

    first_end = date.fromisoformat(first["end_date"])
    assert second["start_date"] == (first_end + timedelta(days=1)).isoformat()

    memberships = (await client.get(
        f"/api/v1/members/{member_id}/memberships", headers=_auth(token)
    )).json()
    statuses = sorted(m["effective_status"] for m in memberships if m["effective_status"] != "cancelled")
    assert statuses == ["active", "scheduled"]


async def test_assign_chains_after_scheduled_membership(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, duration_days=30)
    today = _today_bogota()

    await _assign(client, token, member_id, plan_id, today)
    second = (await _assign(client, token, member_id, plan_id, today)).json()
    third = (await _assign(client, token, member_id, plan_id, today)).json()

    second_end = date.fromisoformat(second["end_date"])
    assert third["start_date"] == (second_end + timedelta(days=1)).isoformat()


async def test_scheduled_membership_does_not_allow_checkin(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, duration_days=30)
    await _assign(client, token, member_id, plan_id, _today_bogota() + timedelta(days=10))

    r = await client.post("/api/v1/checkins", json={"member_id": member_id}, headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["decision"] == "denied"
    assert body["membership_status"] == "scheduled"


async def test_unfreeze_shifts_chained_memberships(client):
    from sqlalchemy import update
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.core.config import settings
    from app.models.tenant.membership_freeze import MembershipFreeze

    email = f"chain-{uuid.uuid4().hex[:6]}@gym.com"
    r = await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Chain", "gym_name": f"Chain Gym {uuid.uuid4().hex[:4]}", "city": "Bogotá",
    })
    assert r.status_code == 201, r.text
    db_name = r.json()["db_name"]
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = login.json()["access_token"]

    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, duration_days=30)
    today = _today_bogota()
    first = (await _assign(client, token, member_id, plan_id, today)).json()
    second = (await _assign(client, token, member_id, plan_id, today)).json()

    r = await client.post(f"/api/v1/memberships/{first['id']}/freeze",
                          json={"reason": "viaje"}, headers=_auth(token))
    assert r.status_code == 200, r.text

    # Simular que la congelación empezó hace 5 días
    url = settings.tenant_database_url_template.replace("{db_name}", db_name)
    engine = create_async_engine(url)
    try:
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as session:
            await session.execute(
                update(MembershipFreeze)
                .where(MembershipFreeze.membership_id == uuid.UUID(first["id"]))
                .values(start_date=today - timedelta(days=5))
            )
            await session.commit()
    finally:
        await engine.dispose()

    r = await client.post(f"/api/v1/memberships/{first['id']}/unfreeze",
                          json={}, headers=_auth(token))
    assert r.status_code == 200, r.text
    new_first_end = date.fromisoformat(r.json()["end_date"])
    assert new_first_end == date.fromisoformat(first["end_date"]) + timedelta(days=5)

    memberships = (await client.get(
        f"/api/v1/members/{member_id}/memberships", headers=_auth(token)
    )).json()
    shifted = next(m for m in memberships if m["id"] == second["id"])
    assert shifted["start_date"] == (new_first_end + timedelta(days=1)).isoformat()
    assert shifted["end_date"] == (
        date.fromisoformat(second["end_date"]) + timedelta(days=5)
    ).isoformat()
    # Nunca dos membresías solapadas tras descongelar
    assert date.fromisoformat(shifted["start_date"]) > new_first_end


# ─── Gracia y expiración ─────────────────────────────────────────────────────

async def test_grace_period_effective_status(client):
    token = await _owner_token(client)
    r = await client.patch("/api/v1/settings/operations",
                           json={"grace_days": 7}, headers=_auth(token))
    assert r.status_code == 200, r.text

    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, duration_days=30)
    # Venció hace 3 días → dentro de la gracia de 7
    start = today_bogota() - timedelta(days=33)
    await _assign(client, token, member_id, plan_id, start)

    memberships = (await client.get(
        f"/api/v1/members/{member_id}/memberships", headers=_auth(token)
    )).json()
    current = next(m for m in memberships if m["effective_status"] != "cancelled")
    assert current["effective_status"] == "in_grace"

    # Reducir gracia a 1 día → la misma membresía pasa a expired
    await client.patch("/api/v1/settings/operations",
                       json={"grace_days": 1}, headers=_auth(token))
    memberships = (await client.get(
        f"/api/v1/members/{member_id}/memberships", headers=_auth(token)
    )).json()
    current = next(m for m in memberships if m["effective_status"] != "cancelled")
    assert current["effective_status"] == "expired"


async def test_expire_job_marks_overdue_memberships(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, duration_days=30)
    start = today_bogota() - timedelta(days=60)
    membership = (await _assign(client, token, member_id, plan_id, start)).json()
    assert membership["status"] == "active"

    r = await client.post("/api/v1/admin/run-job/expire_memberships", headers=_auth(token))
    assert r.status_code == 200, r.text

    memberships = (await client.get(
        f"/api/v1/members/{member_id}/memberships", headers=_auth(token)
    )).json()
    target = next(m for m in memberships if m["id"] == membership["id"])
    assert target["status"] == "expired"

    # Idempotente: segunda corrida no falla
    r = await client.post("/api/v1/admin/run-job/expire_memberships", headers=_auth(token))
    assert r.status_code == 200


# ─── Descuentos y promo codes ────────────────────────────────────────────────

async def test_manual_discount_requires_reason(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token)
    r = await _assign(client, token, member_id, plan_id, today_bogota(),
                      discount_amount=10000.0)
    assert r.status_code == 400


async def test_manual_discount_applies_net_price(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, price=100000.0)
    r = await _assign(client, token, member_id, plan_id, today_bogota(),
                      discount_amount=20000.0, discount_reason="convenio empresa")
    assert r.status_code == 200, r.text
    body = r.json()
    assert float(body["price"]) == 80000.0
    assert float(body["discount_amount"]) == 20000.0


async def test_promo_code_percent_and_max_uses(client):
    token = await _owner_token(client)
    code = f"PROMO{uuid.uuid4().hex[:5].upper()}"
    r = await client.post("/api/v1/promo-codes", json={
        "code": code, "discount_type": "percent", "value": 50, "max_uses": 1,
    }, headers=_auth(token))
    assert r.status_code == 201, r.text

    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, price=100000.0)
    r = await _assign(client, token, member_id, plan_id, today_bogota(), promo_code=code)
    assert r.status_code == 200, r.text
    assert float(r.json()["price"]) == 50000.0

    # Segundo uso supera max_uses
    member2 = await _create_member(client, token)
    r = await _assign(client, token, member2, plan_id, today_bogota(), promo_code=code)
    assert r.status_code == 400


# ─── Auditoría ───────────────────────────────────────────────────────────────

async def test_sensitive_actions_are_audited(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token)
    membership = (await _assign(client, token, member_id, plan_id, today_bogota())).json()
    await client.post(f"/api/v1/memberships/{membership['id']}/freeze",
                      json={"reason": "lesión"}, headers=_auth(token))

    r = await client.get("/api/v1/audit?action=membership", headers=_auth(token))
    assert r.status_code == 200, r.text
    actions = [item["action"] for item in r.json()["items"]]
    assert "membership.freeze" in actions
    assert "membership.assign" in actions


async def test_audit_requires_owner_role(client):
    token = await _owner_token(client)
    invite_email = f"recep-{uuid.uuid4().hex[:6]}@gym.com"
    inv = await client.post("/api/v1/users/invite", json={
        "email": invite_email, "full_name": "Recep", "role": "receptionist",
    }, headers=_auth(token))
    from urllib.parse import urlparse, parse_qs
    invite_token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    acc = await client.post("/api/v1/auth/staff/accept-invite",
                            json={"token": invite_token, "password": "RecepPass123!"})
    recep_token = acc.json()["access_token"]
    r = await client.get("/api/v1/audit", headers=_auth(recep_token))
    assert r.status_code == 403


# ─── Sedes ───────────────────────────────────────────────────────────────────

async def test_locations_crud_and_soft_delete(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/locations", json={
        "name": "Sede Norte", "address": "Calle 100 #1-23", "max_capacity": 80,
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    loc_id = r.json()["id"]

    r = await client.patch(f"/api/v1/locations/{loc_id}",
                           json={"max_capacity": 120}, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["max_capacity"] == 120

    r = await client.delete(f"/api/v1/locations/{loc_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["archived"] is True

    active = (await client.get("/api/v1/locations", headers=_auth(token))).json()
    assert all(loc["id"] != loc_id for loc in active)
