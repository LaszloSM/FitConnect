import uuid
from datetime import date, timedelta

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="checkin@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Checkin", "gym_name": "Checkin Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _member_with_membership(client, token, start: date, duration=30):
    m = await client.post("/api/v1/members", json={
        "full_name": "CheckinMember", "email": f"c-{uuid.uuid4().hex[:10]}@test.com",
    }, headers=_auth(token))
    member_id = m.json()["id"]
    plan = await client.post("/api/v1/member-plans/", json={
        "name": f"Plan {uuid.uuid4().hex[:6]}", "price": 50000, "duration_days": duration,
    }, headers=_auth(token))
    await client.post("/api/v1/member-plans/assign", json={
        "member_id": member_id, "plan_id": plan.json()["id"], "start_date": start.isoformat(),
    }, headers=_auth(token))
    return member_id


async def _member_no_membership(client, token):
    m = await client.post("/api/v1/members", json={
        "full_name": "NoMembership", "email": f"n-{uuid.uuid4().hex[:10]}@test.com",
    }, headers=_auth(token))
    return m.json()["id"]


async def test_active_membership_allowed(client):
    token = await _owner_token(client)
    member_id = await _member_with_membership(client, token, date.today())
    r = await client.post("/api/v1/checkins", json={"member_id": member_id}, headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["decision"] == "allowed"
    assert body["membership_status"] == "ok"


async def test_in_grace_allowed_with_status(client):
    token = await _owner_token(client)
    await client.patch("/api/v1/settings/operations", json={"grace_days": 7}, headers=_auth(token))
    member_id = await _member_with_membership(client, token, date.today() - timedelta(days=33))
    r = await client.post("/api/v1/checkins", json={"member_id": member_id}, headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["decision"] == "allowed"
    assert body["membership_status"] == "in_grace"


async def test_expired_membership_denied(client):
    token = await _owner_token(client)
    await client.patch("/api/v1/settings/operations", json={"grace_days": 1}, headers=_auth(token))
    member_id = await _member_with_membership(client, token, date.today() - timedelta(days=60))
    r = await client.post("/api/v1/checkins", json={"member_id": member_id}, headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["decision"] == "denied"
    assert body["denial_reason"] == "expired"


async def test_no_membership_denied(client):
    token = await _owner_token(client)
    member_id = await _member_no_membership(client, token)
    r = await client.post("/api/v1/checkins", json={"member_id": member_id}, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["decision"] == "denied"
    assert r.json()["denial_reason"] == "no_membership"


async def test_override_after_denial_audits(client):
    token = await _owner_token(client)
    await client.patch("/api/v1/settings/operations", json={"grace_days": 0}, headers=_auth(token))
    member_id = await _member_with_membership(client, token, date.today() - timedelta(days=60))
    denied = await client.post("/api/v1/checkins", json={"member_id": member_id}, headers=_auth(token))
    assert denied.json()["decision"] == "denied"

    r = await client.post("/api/v1/checkins/override", json={
        "member_id": member_id, "reason": "pagará mañana",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["decision"] == "override"

    audit = await client.get("/api/v1/audit?action=checkin", headers=_auth(token))
    actions = [i["action"] for i in audit.json()["items"]]
    assert "checkin.override" in actions


async def test_override_without_recent_denial_rejected(client):
    token = await _owner_token(client)
    member_id = await _member_with_membership(client, token, date.today())
    r = await client.post("/api/v1/checkins/override", json={
        "member_id": member_id, "reason": "sin denegación previa",
    }, headers=_auth(token))
    assert r.status_code == 400


async def test_operations_dashboard_shows_denied_and_grace(client):
    token = await _owner_token(client)
    await client.patch("/api/v1/settings/operations", json={"grace_days": 7}, headers=_auth(token))
    # En gracia
    await _member_with_membership(client, token, date.today() - timedelta(days=33))
    # Denegado hoy
    expired_member = await _member_with_membership(client, token, date.today() - timedelta(days=90))
    await client.patch("/api/v1/settings/operations", json={"grace_days": 7}, headers=_auth(token))
    await client.post("/api/v1/checkins", json={"member_id": expired_member}, headers=_auth(token))

    r = await client.get("/api/v1/dashboard/operations", headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "in_grace" in body
    assert "denied_today" in body
    assert "expiring_this_week" in body
