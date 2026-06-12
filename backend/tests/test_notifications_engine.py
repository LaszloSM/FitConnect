import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def _today_bogota() -> date:
    return datetime.now(ZoneInfo("America/Bogota")).date()

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="notif@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Notif", "gym_name": "Notif Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _member_with_membership(client, token, start: date, duration=30, phone=None):
    m = await client.post("/api/v1/members", json={
        "full_name": "Notificable", "email": f"n-{uuid.uuid4().hex[:10]}@test.com",
        "id_type": "CC", "id_number": str(uuid.uuid4().int)[:10],
        **({"phone": phone} if phone else {}),
    }, headers=_auth(token))
    member_id = m.json()["id"]
    plan = await client.post("/api/v1/member-plans/", json={
        "name": f"Plan {uuid.uuid4().hex[:6]}", "price": 50000, "duration_days": duration,
    }, headers=_auth(token))
    await client.post("/api/v1/member-plans/assign", json={
        "member_id": member_id, "plan_id": plan.json()["id"], "start_date": start.isoformat(),
    }, headers=_auth(token))
    return member_id


async def test_expiry_reminder_emitted_and_idempotent(client):
    token = await _owner_token(client)
    # Membresía que vence exactamente hoy (D-0)
    await _member_with_membership(client, token, date.today() - timedelta(days=30), duration=30)

    r1 = await client.post("/api/v1/admin/run-job/expire_memberships", headers=_auth(token))
    assert r1.status_code == 200, r1.text
    notifs = (await client.get("/api/v1/notifications?limit=100", headers=_auth(token))).json()
    expiring = [n for n in notifs if n["type"] == "membership.expiring"]
    count_first = len(expiring)
    assert count_first >= 1

    # Segunda corrida: no duplica (idempotency_key)
    await client.post("/api/v1/admin/run-job/expire_memberships", headers=_auth(token))
    notifs = (await client.get("/api/v1/notifications?limit=100", headers=_auth(token))).json()
    expiring_after = [n for n in notifs if n["type"] == "membership.expiring"]
    assert len(expiring_after) == count_first


async def test_outbox_endpoint_owner_only(client):
    token = await _owner_token(client)
    r = await client.get("/api/v1/notifications/outbox", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


async def test_preventive_maintenance_alert(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/machines", json={
        "name": f"Caminadora {uuid.uuid4().hex[:5]}",
        "maintenance_interval_days": 30,
        "last_maintenance_date": (date.today() - timedelta(days=60)).isoformat(),
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    machine_id = r.json()["id"]

    await client.post("/api/v1/admin/run-job/expire_memberships", headers=_auth(token))
    notifs = (await client.get("/api/v1/notifications?limit=100", headers=_auth(token))).json()
    maint = [n for n in notifs if n["type"] == "maintenance.due"]
    assert len(maint) >= 1

    # Registrar mantenimiento actualiza last_maintenance_date
    r = await client.post(f"/api/v1/machines/{machine_id}/maintenance", json={
        "machine_id": machine_id, "description": "Lubricación general", "technician": "Carlos",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    machine = (await client.get(f"/api/v1/machines/{machine_id}", headers=_auth(token))).json()
    # El backend registra la fecha en zona Bogotá, no en el UTC del contenedor
    assert machine["last_maintenance_date"] == _today_bogota().isoformat()


async def test_profit_and_compare_reports(client):
    token = await _owner_token(client)
    r = await client.get("/api/v1/reports/profit", headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 6
    assert {"month", "income", "expenses", "profit"} <= set(body[0].keys())

    r = await client.get("/api/v1/reports/revenue-compare", headers=_auth(token))
    assert r.status_code == 200
    assert {"current", "previous", "delta_pct"} <= set(r.json().keys())
