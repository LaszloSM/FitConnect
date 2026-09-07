"""Bloque 6: control de acceso (torniquete/lector) sobre el cerebro de check-in."""
import uuid
from datetime import timedelta

from app.core.timeutil import utcnow_naive
from tests.helpers import create_member, create_member_without_membership

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="acceso@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Acceso", "gym_name": "Acceso Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _turnstile(client, token, **extra):
    r = await client.post("/api/v1/kiosk/devices", json={
        "name": f"Torniquete {uuid.uuid4().hex[:4]}", "kind": "turnstile", "vendor": "zkteco", "model": "TS1000", **extra,
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def _cedula():
    return str(1000000000 + int(uuid.uuid4().int % 899999999))


async def test_verify_allows_active_denies_expired_and_unknown(client):
    token = await _owner_token(client)
    h = _auth(token)
    dev = await _turnstile(client, token)
    dh = _auth(dev["token"])
    assert dev["kind"] == "turnstile"

    active = await create_member(client, h, id_number=_cedula())
    r = await client.post("/api/v1/access/verify", json={"id_number": active["id_number"]}, headers=dh)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["allow"] is True and body["decision"] == "allowed" and body["checkin_id"]
    assert body["member_name"] == active["full_name"]

    # Segundo toque en minutos: pasa sin duplicar asistencia
    again = (await client.post("/api/v1/access/verify", json={"id_number": active["id_number"]}, headers=dh)).json()
    assert again["allow"] is True and again["decision"] == "duplicate"
    checkins = (await client.get(f"/api/v1/members/{active['id']}/checkins", headers=h)).json()
    assert len(checkins) == 1

    # Salida: siempre permitida, no crea check-in
    out = (await client.post("/api/v1/access/verify", json={"id_number": active["id_number"], "direction": "exit"}, headers=dh)).json()
    assert out["allow"] is True and out["checkin_id"] is None

    expired = await create_member_without_membership(client, h, id_number=_cedula())
    r = await client.post("/api/v1/access/verify", json={"id_number": expired["id_number"]}, headers=dh)
    assert r.json()["allow"] is False and r.json()["decision"] == "denied"
    assert r.json()["reason"] == "no_membership"

    r = await client.post("/api/v1/access/verify", json={"id_number": "0000000001"}, headers=dh)
    assert r.json()["allow"] is False and r.json()["decision"] == "not_found"

    # Bitácora del staff
    events = (await client.get("/api/v1/access/events/recent", params={"device_id": dev["id"]}, headers=h)).json()
    decisions = [e["decision"] for e in events]
    assert "allowed" in decisions and "denied" in decisions and "not_found" in decisions and "duplicate" in decisions
    assert all(e["device_name"] == dev["name"] for e in events)


async def test_staff_token_rejected_and_inactive_device(client):
    token = await _owner_token(client)
    h = _auth(token)
    r = await client.post("/api/v1/access/verify", json={"id_number": "1"}, headers=h)
    assert r.status_code == 401
    dev = await _turnstile(client, token)
    await client.delete(f"/api/v1/kiosk/devices/{dev['id']}", headers=h)
    r = await client.post("/api/v1/access/verify", json={"id_number": "1"}, headers=_auth(dev["token"]))
    assert r.status_code == 401


async def test_day_pass_visitor_passes_only_today(client):
    token = await _owner_token(client)
    h = _auth(token)
    dev = await _turnstile(client, token)
    dh = _auth(dev["token"])
    await client.patch("/api/v1/settings/operations", json={"cash_shifts_enabled": False}, headers=h)
    pt = await client.post("/api/v1/day-passes/types", json={"name": f"Pase {uuid.uuid4().hex[:4]}", "price": 15000}, headers=h)
    assert pt.status_code == 201, pt.text
    cedula = _cedula()
    sold = await client.post("/api/v1/day-passes/sell", json={
        "id_number": cedula, "full_name": "Visitante Torniquete", "pass_type_id": pt.json()["id"], "method": "cash",
    }, headers=h)
    assert sold.status_code == 201, sold.text
    r = (await client.post("/api/v1/access/verify", json={"id_number": cedula}, headers=dh)).json()
    assert r["allow"] is True and r["membership_status"] == "ok"


async def test_fingerprint_requires_consent_and_revocation_blocks(client):
    token = await _owner_token(client)
    h = _auth(token)
    dev = await _turnstile(client, token)
    dh = _auth(dev["token"])
    member = await create_member(client, h, id_number=_cedula())
    mid = member["id"]
    reader_id = str(int(uuid.uuid4().int % 90000) + 10000)

    r = await client.post(f"/api/v1/members/{mid}/credentials", json={"kind": "fingerprint", "device_user_id": reader_id}, headers=h)
    assert r.status_code == 409

    c = await client.post(f"/api/v1/members/{mid}/biometric-consents", json={"kind": "fingerprint"}, headers=h)
    assert c.status_code == 201, c.text
    consent_id = c.json()["id"]
    r = await client.post(f"/api/v1/members/{mid}/credentials", json={"kind": "fingerprint", "device_user_id": reader_id, "label": "Índice derecho"}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["consent_id"] == consent_id

    # El lector reporta su ID interno, no la cédula
    v = (await client.post("/api/v1/access/verify", json={"device_user_id": reader_id}, headers=dh)).json()
    assert v["allow"] is True and v["member_id"] == mid

    # Otro socio no puede quedarse con el mismo ID de lector
    other = await create_member(client, h, id_number=_cedula())
    await client.post(f"/api/v1/members/{other['id']}/biometric-consents", json={"kind": "fingerprint"}, headers=h)
    clash = await client.post(f"/api/v1/members/{other['id']}/credentials", json={"kind": "fingerprint", "device_user_id": reader_id}, headers=h)
    assert clash.status_code == 409

    access = (await client.get(f"/api/v1/members/{mid}/access", headers=h)).json()
    assert len(access["credentials"]) == 1 and access["consents"][0]["revoked_at"] is None
    assert any(e["credential_kind"] == "fingerprint" for e in access["events"])

    # Revocar el consentimiento revoca la huella: el lector ya no lo reconoce
    rv = await client.delete(f"/api/v1/members/{mid}/biometric-consents/{consent_id}", headers=h)
    assert rv.status_code == 200 and rv.json()["credentials_revoked"] == 1
    v = (await client.post("/api/v1/access/verify", json={"device_user_id": reader_id}, headers=dh)).json()
    assert v["allow"] is False and v["decision"] == "not_found"

    # La cédula como ID de lector sigue funcionando por convención
    v = (await client.post("/api/v1/access/verify", json={"device_user_id": member["id_number"]}, headers=dh)).json()
    assert v["allow"] is True


async def test_offline_batch_is_idempotent_and_allowlist(client):
    token = await _owner_token(client)
    h = _auth(token)
    dev = await _turnstile(client, token, offline_policy="allow_recent")
    dh = _auth(dev["token"])
    member = await create_member(client, h, id_number=_cedula())
    when = (utcnow_naive() - timedelta(minutes=30)).isoformat()
    batch = {"events": [
        {"client_event_id": "evt-1", "occurred_at": when, "decision": "allowed", "id_number": member["id_number"]},
        {"client_event_id": "evt-2", "occurred_at": when, "decision": "denied", "reason": "offline_unknown", "id_number": "0000000009"},
    ]}
    r = await client.post("/api/v1/access/events", json=batch, headers=dh)
    assert r.status_code == 200, r.text
    assert r.json() == {"accepted": 2, "skipped": 0, "checkins": 1}
    r = await client.post("/api/v1/access/events", json=batch, headers=dh)
    assert r.json() == {"accepted": 0, "skipped": 2, "checkins": 0}
    checkins = (await client.get(f"/api/v1/members/{member['id']}/checkins", headers=h)).json()
    assert len(checkins) == 1 and checkins[0]["source"] == "turnstile"

    al = (await client.get("/api/v1/access/allowlist", headers=dh)).json()
    assert al["policy"] == "allow_recent"
    assert any(m["id_number"] == member["id_number"] for m in al["members"])

    hb = (await client.post("/api/v1/access/heartbeat", headers=dh)).json()
    assert hb["ok"] is True and hb["kind"] == "turnstile" and hb["offline_policy"] == "allow_recent"

    # Un kiosko normal (policy deny) no entrega lista
    kiosk = await client.post("/api/v1/kiosk/devices", json={"name": "Tablet"}, headers=h)
    al = (await client.get("/api/v1/access/allowlist", headers=_auth(kiosk.json()["token"]))).json()
    assert al["policy"] == "deny" and al["members"] == []
