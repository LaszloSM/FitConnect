"""Torniquete conectado: ZKTeco por ADMS (con el emulador) y agente local.

Recorre lo que pasa en un gimnasio real:
- se registra el equipo con su serial y llama solo a la nube;
- FitConnect toma el control de un equipo que ya tenía usuarios (cédulas);
- cada marcación es un check-in; quien entra con plan vencido se bloquea;
- al renovar, el equipo se entera; al crear un socio se enrola su huella/rostro;
- recepción puede abrir; revocar el consentimiento borra la biometría del equipo.
"""
import uuid
from datetime import datetime, timedelta

from httpx import ASGITransport, AsyncClient

from app.core.timeutil import now_bogota
from app.main import app
from scripts.zk_adms_emulator import EmuUser, ZkEmulator
from tests.helpers import create_member, create_member_without_membership, create_plan

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="torniquete@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Torniquete", "gym_name": f"Gym {email.split('@')[0]}", "city": "Barranquilla",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS[email] = r.json()["access_token"]
    return _TOKENS[email]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _cedula():
    return str(1000000000 + uuid.uuid4().int % 899999999)


async def _zk_device(client, h, serial=None):
    serial = serial or f"ZK{uuid.uuid4().hex[:10].upper()}"
    r = await client.post("/api/v1/kiosk/devices", json={
        "name": "Torniquete entrada", "kind": "turnstile", "vendor": "zkteco", "model": "SpeedFace-V5L",
        "serial": serial, "access": {"protocol": "zk_adms"},
    }, headers=h)
    assert r.status_code == 201, r.text
    return r.json(), serial


def _emu(serial):
    return ZkEmulator(client=AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), serial=serial)


async def _commands(client, h, device_id):
    return (await client.get(f"/api/v1/access/devices/{device_id}/status", headers=h)).json()


async def test_unknown_serial_is_rejected_and_handshake_works(client):
    h = _auth(await _owner_token(client))
    r = await client.get("/iclock/cdata", params={"SN": "NOEXISTE123", "options": "all"})
    assert r.status_code == 404
    dev, serial = await _zk_device(client, h)
    emu = _emu(serial)
    r = await emu.handshake()
    assert r.status_code == 200 and r.text.startswith(f"GET OPTION FROM: {serial}")
    assert "TimeZone=-5" in r.text
    assert dev["access"]["protocol"] == "zk_adms"


async def test_serial_cannot_be_claimed_by_another_gym(client):
    h1 = _auth(await _owner_token(client))
    _, serial = await _zk_device(client, h1)
    h2 = _auth(await _owner_token(client, "otro-torniquete@gym.com"))
    r = await client.post("/api/v1/kiosk/devices", json={
        "name": "Robado", "kind": "turnstile", "serial": serial, "access": {"protocol": "zk_adms"},
    }, headers=h2)
    assert r.status_code == 409


async def test_takeover_punch_block_renew_flow(client):
    token = await _owner_token(client)
    h = _auth(token)
    plan_id = await create_plan(client, h, duration_days=30)
    activo = await create_member(client, h, plan_id=plan_id, id_number=_cedula(), full_name="Ana Activa")
    vencido = await create_member_without_membership(client, h, id_number=_cedula(), full_name="Victor Vencido")
    dev, serial = await _zk_device(client, h)
    emu = _emu(serial)
    await emu.handshake()

    # El equipo ya tenía a estas personas (las enroló el programa anterior) y a un desconocido.
    emu.users = {
        activo["id_number"]: EmuUser(pin=activo["id_number"], name="ANA", face=True),
        vencido["id_number"]: EmuUser(pin=vencido["id_number"], name="VICTOR", fingerprints=1),
        "999": EmuUser(pin="999", name="Fantasma"),
    }
    r = await client.post(f"/api/v1/access/devices/{dev['id']}/sync", headers=h)
    assert r.status_code == 200, r.text
    await emu.poll()  # query_users + estados → el equipo responde con su lista

    roster = (await client.get(f"/api/v1/access/devices/{dev['id']}/roster", headers=h)).json()
    by_pin = {u["pin"]: u for u in roster}
    assert by_pin[activo["id_number"]]["member_name"] == "Ana Activa"
    assert by_pin["999"]["member_id"] is None
    # Victor estaba en el equipo pero no tiene plan: quedó bloqueado sin borrarle la huella
    await emu.poll()
    assert emu.users[vencido["id_number"]].can_enter is False
    assert emu.users[vencido["id_number"]].fingerprints == 1
    assert emu.users[activo["id_number"]].can_enter is True

    # Marcación de Ana → check-in; la misma marcación repetida no duplica
    when = now_bogota().replace(tzinfo=None) - timedelta(minutes=1)
    ok, resp = await emu.punch(activo["id_number"], when=when)
    assert ok and resp.text.startswith("OK")
    await emu.punch(activo["id_number"], when=when)
    checkins = (await client.get(f"/api/v1/members/{activo['id']}/checkins", headers=h)).json()
    assert len(checkins) == 1 and checkins[0]["decision"] == "allowed"

    # Victor ya no pasa en el equipo; al renovar, el equipo se entera solo
    ok, _ = await emu.punch(vencido["id_number"])
    assert ok is False
    r = await client.post("/api/v1/member-plans/assign", json={
        "member_id": vencido["id"], "plan_id": plan_id, "start_date": now_bogota().date().isoformat(),
    }, headers=h)
    assert r.status_code == 200, r.text
    received = await emu.poll()
    assert any(vencido["id_number"] in c and "TZ=0000000000000000" in c for c in received)
    ok, _ = await emu.punch(vencido["id_number"])
    assert ok is True


async def test_device_letting_in_an_expired_member_is_corrected(client):
    h = _auth(await _owner_token(client))
    socio = await create_member_without_membership(client, h, id_number=_cedula(), full_name="Desfase Total")
    dev, serial = await _zk_device(client, h)
    emu = _emu(serial)
    await emu.handshake()
    # El equipo tiene un estado viejo: lo deja pasar aunque ya no tiene plan
    emu.users[socio["id_number"]] = EmuUser(pin=socio["id_number"], face=True)
    ok, _ = await emu.punch(socio["id_number"])
    assert ok
    status = await _commands(client, h, dev["id"])
    assert any(c["kind"] == "user_sync" and c["pin"] == socio["id_number"] for c in status["recent_commands"])
    await emu.poll()
    assert emu.users[socio["id_number"]].can_enter is False


async def test_enroll_requires_consent_and_completes_on_device(client):
    h = _auth(await _owner_token(client))
    socio = await create_member(client, h, id_number=_cedula(), full_name="Nueva Socia")
    dev, serial = await _zk_device(client, h)
    emu = _emu(serial)
    await emu.handshake()

    r = await client.post(f"/api/v1/members/{socio['id']}/enroll", json={"device_id": dev["id"], "kind": "fingerprint"}, headers=h)
    assert r.status_code == 409

    r = await client.post(f"/api/v1/members/{socio['id']}/biometric-consents", json={"kind": "fingerprint"}, headers=h)
    assert r.status_code == 201, r.text
    r = await client.post(f"/api/v1/members/{socio['id']}/enroll", json={"device_id": dev["id"], "kind": "fingerprint"}, headers=h)
    assert r.status_code == 201, r.text
    cmd = r.json()
    assert cmd["status"] == "pending" and cmd["pin"] == socio["id_number"]

    await emu.poll()  # crea al usuario y lo pone a enrolar; sube la plantilla
    assert emu.users[socio["id_number"]].fingerprints == 1
    done = (await client.get(f"/api/v1/access/commands/{cmd['id']}", headers=h)).json()
    assert done["status"] == "done"
    access = (await client.get(f"/api/v1/members/{socio['id']}/access", headers=h)).json()
    assert any(c["kind"] == "fingerprint" and c["device_user_id"] == socio["id_number"] for c in access["credentials"])

    # Revocar el consentimiento borra la huella del equipo (Ley 1581)
    consent_id = access["consents"][0]["id"]
    r = await client.delete(f"/api/v1/members/{socio['id']}/biometric-consents/{consent_id}", headers=h)
    assert r.status_code == 200 and r.json()["credentials_revoked"] == 1
    received = await emu.poll()
    assert any(c.startswith("DATA DELETE FINGERTMP") for c in received)
    assert emu.users[socio["id_number"]].fingerprints == 0


async def test_open_door_from_reception(client):
    h = _auth(await _owner_token(client))
    dev, serial = await _zk_device(client, h)
    emu = _emu(serial)
    r = await client.post(f"/api/v1/access/devices/{dev['id']}/open", json={"reason": "Socio sin señal"}, headers=h)
    assert r.status_code == 200, r.text
    received = await emu.poll()
    assert received == ["CONTROL DEVICE 01010105"] and emu.door_opens == 1


async def test_agent_flow_for_hikvision(client):
    h = _auth(await _owner_token(client))
    plan_id = await create_plan(client, h, duration_days=30)
    socio = await create_member(client, h, plan_id=plan_id, id_number=_cedula(), full_name="Hilda Hik")
    r = await client.post("/api/v1/kiosk/devices", json={
        "name": "MinMoe entrada", "kind": "turnstile", "vendor": "hikvision",
        "access": {"protocol": "hik_isapi", "block_strategy": "validity"},
    }, headers=h)
    assert r.status_code == 201, r.text
    dev = r.json()
    ah = _auth(dev["token"])

    r = await client.post("/api/v1/access/agent/roster", json={
        "users": [{"pin": socio["id_number"], "name": "Hilda", "has_face": True}], "full": True,
    }, headers=ah)
    assert r.status_code == 200 and r.json()["linked"] == 1

    await client.post(f"/api/v1/access/devices/{dev['id']}/sync", headers=h)
    cmds = (await client.get("/api/v1/access/agent/commands", headers=ah)).json()
    sync = next(c for c in cmds if c["kind"] == "user_sync")
    assert sync["payload"]["enabled"] is True and sync["payload"]["valid_until"]
    for c in cmds:
        r = await client.post(f"/api/v1/access/agent/commands/{c['id']}/result", json={"ok": True}, headers=ah)
        assert r.status_code == 200

    r = await client.post("/api/v1/access/agent/punches", json={"events": [{
        "client_event_id": "hik-1", "device_user_id": socio["id_number"],
        "occurred_at": (datetime.utcnow() - timedelta(minutes=2)).isoformat() + "Z", "credential_kind": "face",
    }]}, headers=ah)
    assert r.status_code == 200 and r.json() == {"checkin": 1}
    r = await client.post("/api/v1/access/agent/punches", json={"events": [{
        "client_event_id": "hik-1", "device_user_id": socio["id_number"],
        "occurred_at": (datetime.utcnow() - timedelta(minutes=2)).isoformat() + "Z",
    }]}, headers=ah)
    assert r.json() == {"duplicate": 1}

    # Un token de staff no sirve como agente
    r = await client.get("/api/v1/access/agent/commands", headers=h)
    assert r.status_code == 401
