import asyncio
import uuid
from datetime import date, timedelta
from app.core.timeutil import today_bogota

from tests.helpers import create_member_without_membership

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="sessions@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Sessions", "gym_name": "Sessions Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _member_active(client, token, duration=90):
    member = await create_member_without_membership(client, _auth(token), full_name="Asistente")
    member_id = member["id"]
    plan = await client.post("/api/v1/member-plans/", json={
        "name": f"Plan {uuid.uuid4().hex[:6]}", "price": 50000, "duration_days": duration,
    }, headers=_auth(token))
    await client.post("/api/v1/member-plans/assign", json={
        "member_id": member_id, "plan_id": plan.json()["id"], "start_date": today_bogota().isoformat(),
    }, headers=_auth(token))
    return member_id


async def _create_class(client, token, capacity=2):
    # weekday de mañana para garantizar una sesión futura en el horizonte
    tomorrow_weekday = (today_bogota() + timedelta(days=1)).weekday()
    r = await client.post("/api/v1/classes", json={
        "name": f"Yoga {uuid.uuid4().hex[:5]}", "instructor": "Ana",
        "weekdays": [tomorrow_weekday], "start_time": "08:00:00",
        "max_capacity": capacity, "duration_minutes": 60, "category": "yoga",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _next_session(client, token, class_id):
    sessions = (await client.get("/api/v1/class-sessions", headers=_auth(token))).json()
    mine = [s for s in sessions if s["gym_class_id"] == class_id]
    assert mine, "no se materializó ninguna sesión"
    return mine[0]


async def test_class_creation_materializes_sessions(client):
    token = await _owner_token(client)
    class_id = await _create_class(client, token)
    s = await _next_session(client, token, class_id)
    assert s["booked"] == 0
    assert s["capacity"] == 2


async def test_booking_respects_capacity_with_waitlist(client):
    token = await _owner_token(client)
    class_id = await _create_class(client, token, capacity=2)
    session = await _next_session(client, token, class_id)
    sid = session["id"]

    members = [await _member_active(client, token) for _ in range(3)]
    statuses = []
    for m in members:
        r = await client.post(f"/api/v1/class-sessions/{sid}/bookings", json={"member_id": m}, headers=_auth(token))
        assert r.status_code == 201, r.text
        statuses.append(r.json()["status"])
    assert statuses.count("booked") == 2
    assert statuses.count("waitlisted") == 1


async def test_cancel_promotes_waitlist(client):
    token = await _owner_token(client)
    class_id = await _create_class(client, token, capacity=1)
    session = await _next_session(client, token, class_id)
    sid = session["id"]

    m1 = await _member_active(client, token)
    m2 = await _member_active(client, token)
    b1 = (await client.post(f"/api/v1/class-sessions/{sid}/bookings", json={"member_id": m1}, headers=_auth(token))).json()
    b2 = (await client.post(f"/api/v1/class-sessions/{sid}/bookings", json={"member_id": m2}, headers=_auth(token))).json()
    assert b1["status"] == "booked"
    assert b2["status"] == "waitlisted"

    r = await client.delete(f"/api/v1/class-sessions/{sid}/bookings/{b1['booking_id']}", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["promoted_member_id"] == m2

    detail = (await client.get(f"/api/v1/class-sessions/{sid}", headers=_auth(token))).json()
    m2_booking = next(b for b in detail["roster"] if b["member_id"] == m2)
    assert m2_booking["status"] == "booked"


async def test_member_without_membership_cannot_book(client):
    token = await _owner_token(client)
    class_id = await _create_class(client, token)
    session = await _next_session(client, token, class_id)
    m = await create_member_without_membership(client, _auth(token), full_name="Sin Plan")
    r = await client.post(f"/api/v1/class-sessions/{session['id']}/bookings",
                          json={"member_id": m["id"]}, headers=_auth(token))
    assert r.status_code == 400


async def test_attendance_marking(client):
    token = await _owner_token(client)
    class_id = await _create_class(client, token)
    session = await _next_session(client, token, class_id)
    m = await _member_active(client, token)
    booking = (await client.post(f"/api/v1/class-sessions/{session['id']}/bookings",
                                 json={"member_id": m}, headers=_auth(token))).json()
    r = await client.patch(f"/api/v1/class-sessions/{session['id']}/bookings/{booking['booking_id']}",
                           json={"status": "attended"}, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["status"] == "attended"


async def test_materialize_idempotent(client):
    token = await _owner_token(client)
    await _create_class(client, token)
    r1 = await client.post("/api/v1/class-sessions/materialize", headers=_auth(token))
    assert r1.status_code == 200
    # Segunda corrida no crea duplicados
    r2 = await client.post("/api/v1/class-sessions/materialize", headers=_auth(token))
    assert r2.json()["created"] == 0
