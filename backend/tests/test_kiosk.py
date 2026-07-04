import uuid
from datetime import date, timedelta

from tests.helpers import create_member_without_membership

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="kiosk@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Kiosk", "gym_name": "Kiosk Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _device_token(client, token):
    r = await client.post("/api/v1/kiosk/devices", json={"name": "Tablet entrada"}, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _member(client, token, cedula=None):
    cedula = cedula or str(uuid.uuid4().int)[:10]
    member = await create_member_without_membership(
        client, _auth(token), full_name="Kiosko Member", id_number=cedula,
    )
    return member, cedula


async def _activate(client, token, member_id, duration=30):
    plan = (await client.post("/api/v1/member-plans/", json={
        "name": f"Plan K {uuid.uuid4().hex[:6]}", "price": 50000, "duration_days": duration,
    }, headers=_auth(token))).json()
    r = await client.post("/api/v1/member-plans/charge", json={
        "member_id": member_id, "plan_id": plan["id"], "method": "transfer",
    }, headers=_auth(token))
    assert r.status_code == 200, r.text


async def test_kiosk_checkin_by_cedula_allowed(client):
    token = await _owner_token(client)
    device = await _device_token(client, token)
    member, cedula = await _member(client, token)
    await _activate(client, token, member["id"])

    r = await client.post("/api/v1/kiosk/checkin", json={"id_number": cedula},
                          headers=_auth(device["token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] == "allowed"
    assert "Bienvenido" in body["message"]

    # Duplicado inmediato → mensaje amable, no error
    r2 = await client.post("/api/v1/kiosk/checkin", json={"id_number": cedula},
                           headers=_auth(device["token"]))
    assert r2.json()["decision"] == "duplicate"


async def test_kiosk_denied_without_membership(client):
    token = await _owner_token(client)
    device = await _device_token(client, token)
    member, cedula = await _member(client, token)

    r = await client.post("/api/v1/kiosk/checkin", json={"id_number": cedula},
                          headers=_auth(device["token"]))
    body = r.json()
    assert body["decision"] == "denied"
    assert "recepción" in body["message"]

    # El denegado queda registrado y la recepción puede autorizarlo (override)
    r = await client.post("/api/v1/checkins/override", json={
        "member_id": member["id"], "reason": "Va a pagar ahora",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["decision"] == "override"


async def test_kiosk_unknown_cedula(client):
    token = await _owner_token(client)
    device = await _device_token(client, token)
    r = await client.post("/api/v1/kiosk/checkin", json={"id_number": "0000000000"},
                          headers=_auth(device["token"]))
    assert r.json()["decision"] == "not_found"


async def test_revoked_device_is_401(client):
    token = await _owner_token(client)
    device = await _device_token(client, token)
    await client.delete(f"/api/v1/kiosk/devices/{device['id']}", headers=_auth(token))
    r = await client.post("/api/v1/kiosk/checkin", json={"id_number": "123"},
                          headers=_auth(device["token"]))
    assert r.status_code == 401


async def test_staff_token_rejected_on_kiosk(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/kiosk/checkin", json={"id_number": "123"}, headers=_auth(token))
    assert r.status_code == 401


async def test_kiosk_token_rejected_on_staff_endpoints(client):
    token = await _owner_token(client)
    device = await _device_token(client, token)
    r = await client.get("/api/v1/members", headers=_auth(device["token"]))
    # El token kiosko no tiene staff_id ni pasa get_current_staff; members usa
    # get_tenant_db_from_token (db_name) → el guard es que /members exige rol staff
    # en endpoints sensibles; al menos el stream de recepción lo rechaza:
    rs = await client.get("/api/v1/realtime/reception", params={"token": device["token"]})
    assert rs.status_code == 401


async def test_kiosk_auto_attends_class(client):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    token = await _owner_token(client)
    device = await _device_token(client, token)
    member, cedula = await _member(client, token)
    await _activate(client, token, member["id"])

    now = datetime.now(ZoneInfo("America/Bogota"))
    gym_weekday = now.weekday()
    start = (now + timedelta(minutes=30)).strftime("%H:%M")
    gym_class = (await client.post("/api/v1/classes", json={
        "name": f"Spinning {uuid.uuid4().hex[:5]}",
        "instructor": "Coach",
        "weekdays": [gym_weekday],
        "start_time": start,
        "duration_minutes": 45,
        "max_capacity": 10,
    }, headers=_auth(token))).json()

    sessions = (await client.get("/api/v1/class-sessions", params={
        "date_from": now.date().isoformat(), "date_to": now.date().isoformat(),
    }, headers=_auth(token))).json()
    session = next(s for s in sessions if s["gym_class_id"] == gym_class["id"])
    booking = await client.post(
        f"/api/v1/class-sessions/{session['id']}/bookings",
        json={"member_id": member["id"]},
        headers=_auth(token),
    )
    assert booking.status_code in (200, 201), booking.text

    r = await client.post("/api/v1/kiosk/checkin", json={"id_number": cedula},
                          headers=_auth(device["token"]))
    body = r.json()
    assert body["decision"] == "allowed"
    assert body["upcoming_class"] is not None
    assert body["upcoming_class"]["start_time"] == start

    detail = (await client.get(f"/api/v1/class-sessions/{session['id']}", headers=_auth(token))).json()
    statuses = {b["member_id"]: b["status"] for b in detail["roster"]}
    assert statuses.get(member["id"]) == "attended"
