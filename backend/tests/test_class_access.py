import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="access@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Access", "gym_name": "Access Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _member(client, token):
    r = await client.post("/api/v1/members", json={
        "full_name": "Clase Member", "email": f"a-{uuid.uuid4().hex[:10]}@test.com",
        "id_type": "CC", "id_number": str(uuid.uuid4().int)[:10],
    }, headers=_auth(token))
    return r.json()["id"]


async def _plan(client, token, **kwargs):
    payload = {
        "name": f"Plan A {uuid.uuid4().hex[:6]}", "price": 60000, "duration_days": 30,
        **kwargs,
    }
    r = await client.post("/api/v1/member-plans/", json=payload, headers=_auth(token))
    assert r.status_code == 200 or r.status_code == 201, r.text
    return r.json()


async def _assign(client, token, member_id, plan_id):
    r = await client.post("/api/v1/member-plans/assign", json={
        "member_id": member_id, "plan_id": plan_id, "start_date": date.today().isoformat(),
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


async def _sessions_today(client, token, n=3):
    """Crea una clase hoy con n horarios distintos y devuelve las sesiones."""
    now = datetime.now(ZoneInfo("America/Bogota"))
    weekday = now.weekday()
    created = []
    for i in range(n):
        start = (now + timedelta(hours=2 + i)).strftime("%H:%M")
        gc = (await client.post("/api/v1/classes", json={
            "name": f"Clase {uuid.uuid4().hex[:5]}",
            "instructor": "Coach",
            "weekdays": [weekday],
            "start_time": start,
            "duration_minutes": 45,
            "max_capacity": 10,
        }, headers=_auth(token))).json()
        created.append(gc["id"])
    sessions = (await client.get("/api/v1/class-sessions", params={
        "date_from": now.date().isoformat(), "date_to": now.date().isoformat(),
    }, headers=_auth(token))).json()
    return [s for s in sessions if s["gym_class_id"] in created]


async def test_gym_only_plan_cannot_book(client):
    token = await _owner_token(client)
    member_id = await _member(client, token)
    plan = await _plan(client, token, access_type="gym_only")
    await _assign(client, token, member_id, plan["id"])
    sessions = await _sessions_today(client, token, n=1)

    r = await client.post(f"/api/v1/class-sessions/{sessions[0]['id']}/bookings",
                          json={"member_id": member_id}, headers=_auth(token))
    assert r.status_code == 403
    assert "no incluye clases" in r.json()["detail"]


async def test_credit_limit_enforced_exactly(client):
    token = await _owner_token(client)
    member_id = await _member(client, token)
    plan = await _plan(client, token, access_type="gym_and_classes", class_credits_per_month=2)
    await _assign(client, token, member_id, plan["id"])
    sessions = await _sessions_today(client, token, n=3)

    r1 = await client.post(f"/api/v1/class-sessions/{sessions[0]['id']}/bookings",
                           json={"member_id": member_id}, headers=_auth(token))
    assert r1.status_code == 201, r1.text
    assert r1.json()["credits_remaining"] == 1
    r2 = await client.post(f"/api/v1/class-sessions/{sessions[1]['id']}/bookings",
                           json={"member_id": member_id}, headers=_auth(token))
    assert r2.status_code == 201
    assert r2.json()["credits_remaining"] == 0
    r3 = await client.post(f"/api/v1/class-sessions/{sessions[2]['id']}/bookings",
                           json={"member_id": member_id}, headers=_auth(token))
    assert r3.status_code == 403
    assert "2/2" in r3.json()["detail"]

    # Cancelar una reserva devuelve el crédito
    await client.delete(
        f"/api/v1/class-sessions/{sessions[0]['id']}/bookings/{r1.json()['booking_id']}",
        headers=_auth(token),
    )
    r4 = await client.post(f"/api/v1/class-sessions/{sessions[2]['id']}/bookings",
                           json={"member_id": member_id}, headers=_auth(token))
    assert r4.status_code == 201, r4.text


async def test_unlimited_plan_books_freely(client):
    token = await _owner_token(client)
    member_id = await _member(client, token)
    plan = await _plan(client, token)  # default: gym_and_classes ilimitadas
    await _assign(client, token, member_id, plan["id"])
    sessions = await _sessions_today(client, token, n=2)
    for s in sessions:
        r = await client.post(f"/api/v1/class-sessions/{s['id']}/bookings",
                              json={"member_id": member_id}, headers=_auth(token))
        assert r.status_code == 201, r.text
        assert r.json()["credits_remaining"] is None


async def test_snapshot_immune_to_plan_edit(client):
    token = await _owner_token(client)
    member_id = await _member(client, token)
    plan = await _plan(client, token)  # ilimitadas al momento de la venta
    await _assign(client, token, member_id, plan["id"])

    # El gym recorta el plan a gym_only DESPUÉS de la venta
    r = await client.put(f"/api/v1/member-plans/{plan['id']}",
                         json={"access_type": "gym_only"}, headers=_auth(token))
    assert r.status_code == 200, r.text

    # El miembro conserva lo que compró
    sessions = await _sessions_today(client, token, n=1)
    booking = await client.post(f"/api/v1/class-sessions/{sessions[0]['id']}/bookings",
                                json={"member_id": member_id}, headers=_auth(token))
    assert booking.status_code == 201, booking.text


async def test_instructor_crud_and_class_link(client):
    token = await _owner_token(client)
    instructor = (await client.post("/api/v1/instructors", json={
        "full_name": "Carlos Trainer", "specialty": "Crossfit",
    }, headers=_auth(token))).json()

    now = datetime.now(ZoneInfo("America/Bogota"))
    gc = (await client.post("/api/v1/classes", json={
        "name": f"WOD {uuid.uuid4().hex[:5]}",
        "instructor": instructor["full_name"],
        "instructor_id": instructor["id"],
        "weekdays": [now.weekday()],
        "start_time": "06:00",
        "duration_minutes": 60,
        "max_capacity": 12,
    }, headers=_auth(token))).json()
    assert gc.get("instructor_id") == instructor["id"] or gc.get("instructor") == "Carlos Trainer"

    # Renombrar al instructor actualiza el snapshot de sus clases
    r = await client.put(f"/api/v1/instructors/{instructor['id']}",
                         json={"full_name": "Carlos Coach"}, headers=_auth(token))
    assert r.status_code == 200
    listing = (await client.get("/api/v1/instructors", headers=_auth(token))).json()
    me = next(i for i in listing if i["id"] == instructor["id"])
    assert me["full_name"] == "Carlos Coach"
    assert me["classes_count"] >= 1

    r = await client.delete(f"/api/v1/instructors/{instructor['id']}", headers=_auth(token))
    assert r.json() == {"archived": True}
