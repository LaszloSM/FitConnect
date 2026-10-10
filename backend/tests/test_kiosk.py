import uuid
from datetime import timedelta

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
    """La tablet del mostrador está al alcance de cualquiera que entre al gym.

    Su token sirve para registrar asistencia y nada más: si abriera el listado de
    socios, bastaría con tomar la tablet para llevarse los teléfonos de todos.

    Antes este test pedía /members con el token del dispositivo y NO afirmaba
    nada sobre la respuesta: un 200 habría pasado igual de verde.
    """
    token = await _owner_token(client)
    device = await _device_token(client, token)
    kiosko = _auth(device["token"])

    for ruta in (
        "/api/v1/members",
        "/api/v1/payments",
        "/api/v1/users",
        "/api/v1/dashboard/kpis",
        "/api/v1/cash/shifts/current",
    ):
        r = await client.get(ruta, headers=kiosko)
        assert r.status_code in (401, 403), f"{ruta} respondió {r.status_code} a un token de kiosko"

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
    # Ventana de auto-attend: ±60 min. Cerca de medianoche now+30min cae en el
    # día siguiente (la sesión ya no es "de hoy"): usar una clase que acaba de empezar.
    target = now + timedelta(minutes=30)
    if target.date() != now.date():
        target = now - timedelta(minutes=30)
    start = target.strftime("%H:%M")
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


async def test_device_rename(client):
    token = await _owner_token(client)
    device = await _device_token(client, token)

    r = await client.patch(f"/api/v1/kiosk/devices/{device['id']}",
                           json={"name": "Tablet piso 2"}, headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Tablet piso 2"

    listing = (await client.get("/api/v1/kiosk/devices", headers=_auth(token))).json()
    names = {d["id"]: d["name"] for d in listing}
    assert names[device["id"]] == "Tablet piso 2"


async def test_device_regenerate_link_rotates_token(client):
    token = await _owner_token(client)
    device = await _device_token(client, token)

    r = await client.post(f"/api/v1/kiosk/devices/{device['id']}/regenerate-link",
                          headers=_auth(token))
    assert r.status_code == 200, r.text
    new_token = r.json()["token"]

    # El token anterior queda inválido (jti rotado); el nuevo funciona
    old = await client.get("/api/v1/kiosk/ping", headers=_auth(device["token"]))
    assert old.status_code == 401
    new = await client.get("/api/v1/kiosk/ping", headers=_auth(new_token))
    assert new.status_code == 200, new.text


async def test_entry_qr_is_gone_everywhere(client):
    """El QR de entrada se quitó: ni el carné ni el de la app abren la puerta."""
    from app.main import app
    paths = {getattr(r, "path", "") for r in app.routes}
    assert "/api/v1/checkins/qr/{qr_code}" not in paths
