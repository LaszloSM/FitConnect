"""Panel de plataforma: ingreso con app autenticadora obligatoria, aislamiento de
tokens frente a la app de gimnasios, gestión de la suscripción y bitácora."""
import time
import uuid
from datetime import timedelta

from app.core import totp
from app.core.security import hash_password
from app.core.timeutil import today_bogota
from app.db.master_session import MasterSessionLocal
from app.models.master.platform import PlatformAdmin

PASSWORD = "ClaveDelPanel2026!"


async def _admin() -> str:
    email = f"plat-{uuid.uuid4().hex[:8]}@demo.example.com"
    async with MasterSessionLocal() as db:
        db.add(PlatformAdmin(email=email, full_name="Operador", hashed_password=hash_password(PASSWORD)))
        await db.commit()
    return email


async def _gym(client) -> tuple[str, str]:
    email = f"g-{uuid.uuid4().hex[:8]}@gym.com"
    r = await client.post("/api/v1/auth/register", json={
        "email": email, "password": "SecurePass123!", "full_name": "Dueño", "gym_name": "Gym Plataforma",
        "city": "Cali",
    })
    assert r.status_code == 201, r.text
    return email, r.json()["tenant_id"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


async def _session(client) -> tuple[str, str, dict]:
    email = await _admin()
    r = await client.post("/api/platform/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["step"] == "enroll" and "access_token" not in body
    r = await client.post("/api/platform/auth/enroll",
                          json={"ticket": body["ticket"], "code": totp.code_at(body["secret"])})
    assert r.status_code == 200, r.text
    return email, body["secret"], r.json()


async def test_first_login_requires_authenticator_then_every_login_asks_code(client):
    email, secret, session = await _session(client)
    assert len(session["backup_codes"]) == 8
    me = await client.get("/api/platform/auth/me", headers=_h(session["access_token"]))
    assert me.status_code == 200 and me.json()["email"] == email

    r = await client.post("/api/platform/auth/login", json={"email": email, "password": PASSWORD})
    assert r.json()["step"] == "otp" and "secret" not in r.json()
    ticket = r.json()["ticket"]
    # El ticket del paso intermedio no abre el panel.
    assert (await client.get("/api/platform/auth/me", headers=_h(ticket))).status_code == 401
    assert (await client.post("/api/platform/auth/verify", json={"ticket": ticket, "code": "123456"})).status_code == 401
    ok = await client.post("/api/platform/auth/verify",
                           json={"ticket": ticket, "code": totp.code_at(secret, time.time() + 30)})
    assert ok.status_code == 200, ok.text

    assert (await client.post("/api/platform/auth/logout", headers=_h(ok.json()["access_token"]))).status_code == 200
    assert (await client.get("/api/platform/auth/me", headers=_h(ok.json()["access_token"]))).status_code == 401


async def test_wrong_passwords_lock_the_panel_account(client):
    email = await _admin()
    for _ in range(5):
        r = await client.post("/api/platform/auth/login", json={"email": email, "password": "mala"})
        assert r.status_code == 401
    r = await client.post("/api/platform/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 429


async def test_gym_and_platform_tokens_do_not_cross(client):
    _, _, session = await _session(client)
    gym_email, _ = await _gym(client)
    gym_token = (await client.post("/api/v1/auth/login",
                                   json={"email": gym_email, "password": "SecurePass123!"})).json()["access_token"]
    assert (await client.get("/api/platform/tenants", headers=_h(gym_token))).status_code == 401
    assert (await client.get("/api/v1/members", headers=_h(session["access_token"]))).status_code == 401


async def test_manage_trial_comp_suspend_and_audit(client):
    _, _, session = await _session(client)
    h = _h(session["access_token"])
    gym_email, tenant_id = await _gym(client)

    lst = await client.get("/api/platform/tenants", params={"q": gym_email}, headers=h)
    assert lst.status_code == 200, lst.text
    item = lst.json()["items"][0]
    assert item["id"] == tenant_id and item["subscription"]["status"] == "trialing"
    # Privacidad: solo conteos, nunca datos de socios.
    assert set(item["metrics"]) >= {"members", "active_members", "checkins_30d", "turnstiles"}
    assert "full_name" not in str(item["metrics"])

    r = await client.post(f"/api/platform/tenants/{tenant_id}/trial", json={"days": 30}, headers=h)
    assert r.status_code == 200
    assert r.json()["subscription"]["days_left"] >= 30

    until = (today_bogota() + timedelta(days=90)).isoformat()
    no_reason = await client.post(f"/api/platform/tenants/{tenant_id}/comp", json={"until": until}, headers=h)
    assert no_reason.status_code == 422
    r = await client.post(f"/api/platform/tenants/{tenant_id}/comp",
                          json={"until": until, "reason": "Gimnasio piloto"}, headers=h)
    assert r.status_code == 200 and r.json()["subscription"]["status"] == "comp"

    r = await client.patch(f"/api/platform/tenants/{tenant_id}",
                           json={"plan": "advanced", "modules": {"ai": True}}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["subscription"]["modules"] == ["ai", "member_app"]
    bad = await client.patch(f"/api/platform/tenants/{tenant_id}", json={"modules": {"cripto": True}}, headers=h)
    assert bad.status_code == 422

    r = await client.post(f"/api/platform/tenants/{tenant_id}/suspend", json={"reason": "Pidió la baja"}, headers=h)
    assert r.json()["subscription"]["status"] == "suspended"
    login = await client.post("/api/v1/auth/login", json={"email": gym_email, "password": "SecurePass123!"})
    assert login.status_code == 403
    await client.post(f"/api/platform/tenants/{tenant_id}/reactivate", headers=h)
    login = await client.post("/api/v1/auth/login", json={"email": gym_email, "password": "SecurePass123!"})
    assert login.status_code == 200

    detail = (await client.get(f"/api/platform/tenants/{tenant_id}", headers=h)).json()
    actions = [x["action"] for x in detail["history"]]
    for a in ("tenant.trial", "tenant.comp", "tenant.update", "tenant.suspend", "tenant.reactivate"):
        assert a in actions
    audit = await client.get("/api/platform/tenants/-/audit", headers=h)
    assert audit.status_code == 200 and any(x["tenant"] == "Gym Plataforma" for x in audit.json())

    overview = await client.get("/api/platform/tenants/overview", headers=h)
    assert overview.status_code == 200 and overview.json()["total"] >= 1


async def test_panel_requires_session(client):
    assert (await client.get("/api/platform/tenants")).status_code == 401
    assert (await client.get("/api/platform/tenants/overview")).status_code == 401


async def test_code_step_respects_lockout_and_tickets_are_single_use(client):
    email, secret, _ = await _session(client)
    ticket = (await client.post("/api/platform/auth/login", json={"email": email, "password": PASSWORD})).json()["ticket"]
    for _ in range(5):
        assert (await client.post("/api/platform/auth/verify", json={"ticket": ticket, "code": "000000"})).status_code == 401
    locked = await client.post("/api/platform/auth/verify",
                               json={"ticket": ticket, "code": totp.code_at(secret, time.time() + 30)})
    assert locked.status_code == 429

    other_email, other_secret, _ = await _session(client)
    t2 = (await client.post("/api/platform/auth/login", json={"email": other_email, "password": PASSWORD})).json()["ticket"]
    ok = await client.post("/api/platform/auth/verify", json={"ticket": t2, "code": totp.code_at(other_secret, time.time() + 30)})
    assert ok.status_code == 200
    reuse = await client.post("/api/platform/auth/verify", json={"ticket": t2, "code": totp.code_at(other_secret, time.time() - 30)})
    assert reuse.status_code == 401


async def test_spoofed_forwarded_for_does_not_pass_the_ip_allowlist(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "platform_allowed_ips", ["181.49.10.20"])
    r = await client.post("/api/platform/auth/login", json={"email": "x@y.co", "password": "x"},
                          headers={"x-forwarded-for": "181.49.10.20, 8.8.4.4"})
    # El atacante escribe la IP permitida; el proxy agrega su IP real al final.
    assert r.status_code == 403


async def test_reset_owner_two_step_from_panel(client, monkeypatch):
    from app.core.config import settings
    _, _, session = await _session(client)
    h = _h(session["access_token"])
    gym_email, tenant_id = await _gym(client)
    token = (await client.post("/api/v1/auth/login", json={"email": gym_email, "password": "SecurePass123!"})).json()["access_token"]
    setup = (await client.post("/api/v1/auth/mfa/setup", headers=_h(token))).json()
    await client.post("/api/v1/auth/mfa/enable", json={"code": totp.code_at(setup["secret"])}, headers=_h(token))
    assert "challenge_token" in (await client.post("/api/v1/auth/login", json={"email": gym_email, "password": "SecurePass123!"})).json()

    short = await client.post(f"/api/platform/tenants/{tenant_id}/reset-owner-mfa", json={"reason": "x"}, headers=h)
    assert short.status_code == 422
    r = await client.post(f"/api/platform/tenants/{tenant_id}/reset-owner-mfa",
                          json={"reason": "Perdió el celular, verificado por llamada"}, headers=h)
    assert r.status_code == 200, r.text
    monkeypatch.setattr(settings, "mfa_required_roles", ["owner", "admin"])
    login = (await client.post("/api/v1/auth/login", json={"email": gym_email, "password": "SecurePass123!"})).json()
    assert login["mfa_setup_required"] is True


async def test_comp_by_months_notifies_the_owner_by_email(client):
    from app.services import mailer
    _, _, session = await _session(client)
    h = _h(session["access_token"])
    gym_email, tenant_id = await _gym(client)
    r = await client.post(f"/api/platform/tenants/{tenant_id}/comp",
                          json={"months": 3, "reason": "Gimnasio piloto"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["subscription"]["status"] == "comp" and body["notified"] is True
    assert 88 <= body["subscription"]["days_left"] <= 93
    mail = [m for m in mailer.OUTBOX if m.to == gym_email][-1]
    assert "cortesía" in mail.subject and "Gimnasio piloto" in mail.text
    r = await client.post(f"/api/platform/tenants/{tenant_id}/trial", json={"days": 15, "notify": False}, headers=h)
    assert r.json()["notified"] is False


async def test_system_health_for_the_panel(client):
    _, _, session = await _session(client)
    r = await client.get("/api/platform/tenants/-/system", headers=_h(session["access_token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dependencies"]["database"] == "ok" and "email_configured" in body and isinstance(body["jobs"], list)
    assert (await client.get("/api/platform/tenants/-/system")).status_code in (401, 403)


async def test_no_platform_response_carries_member_data(client):
    """El panel ve gimnasios y conteos, nunca personas: se crea un socio con datos
    reconocibles y ninguna respuesta del panel puede contenerlos."""
    from tests.helpers import create_member
    _, _, session = await _session(client)
    h = _h(session["access_token"])
    gym_email, tenant_id = await _gym(client)
    owner = (await client.post("/api/v1/auth/login", json={"email": gym_email, "password": "SecurePass123!"})).json()
    marker = uuid.uuid4().hex[:8]
    member = await create_member(client, _h(owner["access_token"]), full_name=f"Socia Privada {marker}",
                                 email=f"privada-{marker}@correo.com", phone="3157654321")
    responses = [
        await client.get("/api/platform/tenants/overview", headers=h),
        await client.get("/api/platform/tenants", params={"q": gym_email}, headers=h),
        await client.get(f"/api/platform/tenants/{tenant_id}", headers=h),
        await client.get("/api/platform/tenants/-/audit", headers=h),
        await client.get("/api/platform/tenants/-/system", headers=h),
    ]
    for r in responses:
        assert r.status_code == 200, r.text
        for secret in (marker, member["id_number"], "3157654321", member["id"]):
            assert secret not in r.text, f"{r.request.url} expone datos de un socio"
