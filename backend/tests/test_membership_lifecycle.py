import uuid
from datetime import date, timedelta


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
    r = await client.post("/api/v1/members", json={
        "full_name": "Miembro Prueba",
        "email": f"m-{uuid.uuid4().hex[:10]}@test.com",
        "id_type": "CC", "id_number": str(uuid.uuid4().int)[:10],
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


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
    membership = (await _assign(client, token, member_id, plan_id, date.today())).json()
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
    membership = (await _assign(client, token, member_id, plan_id, date.today())).json()

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
    membership = (await _assign(client, token, member_id, plan_id, date.today())).json()

    r = await client.post(f"/api/v1/memberships/{membership['id']}/cancel", headers=_auth(token))
    assert r.status_code == 200
    r = await client.post(f"/api/v1/memberships/{membership['id']}/freeze",
                          json={}, headers=_auth(token))
    assert r.status_code == 400


# ─── Gracia y expiración ─────────────────────────────────────────────────────

async def test_grace_period_effective_status(client):
    token = await _owner_token(client)
    r = await client.patch("/api/v1/settings/operations",
                           json={"grace_days": 7}, headers=_auth(token))
    assert r.status_code == 200, r.text

    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, duration_days=30)
    # Venció hace 3 días → dentro de la gracia de 7
    start = date.today() - timedelta(days=33)
    await _assign(client, token, member_id, plan_id, start)

    memberships = (await client.get(
        f"/api/v1/members/{member_id}/memberships", headers=_auth(token)
    )).json()
    assert memberships[0]["effective_status"] == "in_grace"

    # Reducir gracia a 1 día → la misma membresía pasa a expired
    await client.patch("/api/v1/settings/operations",
                       json={"grace_days": 1}, headers=_auth(token))
    memberships = (await client.get(
        f"/api/v1/members/{member_id}/memberships", headers=_auth(token)
    )).json()
    assert memberships[0]["effective_status"] == "expired"


async def test_expire_job_marks_overdue_memberships(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, duration_days=30)
    start = date.today() - timedelta(days=60)
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
    r = await _assign(client, token, member_id, plan_id, date.today(),
                      discount_amount=10000.0)
    assert r.status_code == 400


async def test_manual_discount_applies_net_price(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token, price=100000.0)
    r = await _assign(client, token, member_id, plan_id, date.today(),
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
    r = await _assign(client, token, member_id, plan_id, date.today(), promo_code=code)
    assert r.status_code == 200, r.text
    assert float(r.json()["price"]) == 50000.0

    # Segundo uso supera max_uses
    member2 = await _create_member(client, token)
    r = await _assign(client, token, member2, plan_id, date.today(), promo_code=code)
    assert r.status_code == 400


# ─── Auditoría ───────────────────────────────────────────────────────────────

async def test_sensitive_actions_are_audited(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token)
    membership = (await _assign(client, token, member_id, plan_id, date.today())).json()
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
    await client.post("/api/v1/users/invite", json={
        "email": invite_email, "full_name": "Recep", "role": "receptionist",
    }, headers=_auth(token))
    r = await client.post("/api/v1/auth/staff/login",
                          json={"email": invite_email, "password": "TempPass123!"})
    recep_token = r.json()["access_token"]
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
