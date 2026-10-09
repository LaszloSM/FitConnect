"""Seguridad de cuentas del gimnasio: verificación en dos pasos, cierre de sesión,
recuperar contraseña, bloqueo por intentos, gimnasio suspendido y solo lectura."""
import re
import time
import uuid
from datetime import timedelta

import pytest

from app.core import totp
from app.core.config import settings
from app.core.timeutil import today_bogota
from app.db.master_session import MasterSessionLocal
from app.models.master.tenant import Tenant, TenantStatus
from app.services import account_security, mailer, subscription

PASSWORD = "SecurePass123!"


async def _register(client) -> tuple[str, str]:
    email = f"sec-{uuid.uuid4().hex[:10]}@gym.com"
    r = await client.post("/api/v1/auth/register", json={
        "email": email, "password": PASSWORD, "full_name": "Dueña Segura",
        "gym_name": "Gym Seguro", "city": "Medellín",
    })
    assert r.status_code == 201, r.text
    return email, r.json()["tenant_id"]


async def _login(client, email, password=PASSWORD):
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _h(token):
    return {"Authorization": f"Bearer {token}"}


async def _set_tenant(tenant_id, **values):
    async with MasterSessionLocal() as db:
        t = await db.get(Tenant, uuid.UUID(tenant_id))
        for k, v in values.items():
            setattr(t, k, v)
        await db.commit()
        subscription.forget(t.db_name)


@pytest.fixture
def mfa_required(monkeypatch):
    monkeypatch.setattr(settings, "mfa_required_roles", ["owner", "admin"])


async def _enable_mfa(client, token) -> tuple[str, dict]:
    r = await client.post("/api/v1/auth/mfa/setup", headers=_h(token))
    assert r.status_code == 200, r.text
    secret = r.json()["secret"]
    assert r.json()["otpauth_uri"].startswith("otpauth://totp/")
    r = await client.post("/api/v1/auth/mfa/enable", json={"code": totp.code_at(secret)}, headers=_h(token))
    assert r.status_code == 200, r.text
    return secret, r.json()


async def test_owner_must_configure_two_step_before_using_the_system(client, mfa_required):
    email, _ = await _register(client)
    r = await _login(client, email)
    assert r.status_code == 200, r.text
    assert r.json()["mfa_setup_required"] is True
    token = r.json()["access_token"]

    blocked = await client.get("/api/v1/members", headers=_h(token))
    assert blocked.status_code == 403 and blocked.json()["detail"] == "mfa_setup_required"

    secret, enabled = await _enable_mfa(client, token)
    assert len(enabled["backup_codes"]) == 8
    session = enabled["session"]
    assert session["mfa_setup_required"] is False
    assert (await client.get("/api/v1/members", headers=_h(session["access_token"]))).status_code == 200
    # El token de "solo configurar" quedó revocado.
    assert (await client.get("/api/v1/auth/mfa/status", headers=_h(token))).status_code == 401

    # Siguiente ingreso: contraseña y después el código.
    r = await _login(client, email)
    assert r.status_code == 200 and "challenge_token" in r.json() and "access_token" not in r.json()
    challenge = r.json()["challenge_token"]
    # El token del paso intermedio no abre nada.
    assert (await client.get("/api/v1/members", headers=_h(challenge))).status_code == 401

    bad = await client.post("/api/v1/auth/mfa/verify", json={"challenge_token": challenge, "code": "000000"})
    assert bad.status_code == 401
    code = totp.code_at(secret, time.time() + 30)
    ok = await client.post("/api/v1/auth/mfa/verify", json={"challenge_token": challenge, "code": code})
    assert ok.status_code == 200, ok.text
    assert (await client.get("/api/v1/members", headers=_h(ok.json()["access_token"]))).status_code == 200
    # El mismo código no sirve dos veces.
    again = await client.post("/api/v1/auth/mfa/verify", json={"challenge_token": challenge, "code": code})
    assert again.status_code == 401

    # Código de respaldo: sirve una vez.
    backup = enabled["backup_codes"][0]
    used = await client.post("/api/v1/auth/mfa/verify", json={"challenge_token": challenge, "code": backup})
    assert used.status_code == 200, used.text
    twice = await client.post("/api/v1/auth/mfa/verify", json={"challenge_token": challenge, "code": backup})
    assert twice.status_code == 401
    status = await client.get("/api/v1/auth/mfa/status", headers=_h(used.json()["access_token"]))
    assert status.json() == {"enabled": True, "required": True, "backup_codes_left": 7}

    # Dueño: no puede apagarla.
    off = await client.post("/api/v1/auth/mfa/disable", json={"password": PASSWORD, "code": totp.code_at(secret)},
                            headers=_h(used.json()["access_token"]))
    assert off.status_code == 409


async def test_two_step_is_optional_when_role_does_not_require_it(client):
    email, _ = await _register(client)
    r = await _login(client, email)
    assert r.json()["mfa_setup_required"] is False
    token = r.json()["access_token"]
    secret, enabled = await _enable_mfa(client, token)
    session = enabled["session"]["access_token"]
    off = await client.post("/api/v1/auth/mfa/disable",
                            json={"password": PASSWORD, "code": totp.code_at(secret, time.time() + 30)},
                            headers=_h(session))
    assert off.status_code == 200, off.text
    r = await _login(client, email)
    assert "access_token" in r.json()


async def test_logout_revokes_the_token_and_refresh_rotates_it(client):
    email, _ = await _register(client)
    token = (await _login(client, email)).json()["access_token"]
    r = await client.post("/api/v1/auth/refresh", headers=_h(token))
    assert r.status_code == 200, r.text
    fresh = r.json()["access_token"]
    assert (await client.get("/api/v1/members", headers=_h(token))).status_code == 401
    assert (await client.get("/api/v1/members", headers=_h(fresh))).status_code == 200

    assert (await client.post("/api/v1/auth/logout", headers=_h(fresh))).status_code == 200
    assert (await client.get("/api/v1/members", headers=_h(fresh))).status_code == 401


async def test_password_reset_with_single_use_link(client):
    email, _ = await _register(client)
    mailer.OUTBOX.clear()
    r = await client.post("/api/v1/auth/password/forgot", json={"email": email.upper()})
    assert r.status_code == 200
    assert len(mailer.OUTBOX) == 1 and mailer.OUTBOX[0].to == email
    token = re.search(r"token=([\w-]+)", mailer.OUTBOX[0].text).group(1)

    short = await client.post("/api/v1/auth/password/reset", json={"token": token, "password": "corta"})
    assert short.status_code == 422
    r = await client.post("/api/v1/auth/password/reset", json={"token": token, "password": "NuevaClave2026!"})
    assert r.status_code == 200, r.text
    assert (await _login(client, email)).status_code == 401
    assert (await _login(client, email, "NuevaClave2026!")).status_code == 200
    reuse = await client.post("/api/v1/auth/password/reset", json={"token": token, "password": "OtraClave2026!"})
    assert reuse.status_code == 400


async def test_forgot_password_does_not_reveal_unknown_emails(client):
    mailer.OUTBOX.clear()
    r = await client.post("/api/v1/auth/password/forgot", json={"email": f"nadie-{uuid.uuid4().hex[:6]}@x.com"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert mailer.OUTBOX == []


async def test_repeated_wrong_passwords_lock_the_account(client, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 3)
    email, _ = await _register(client)
    try:
        for _ in range(3):
            assert (await _login(client, email, "mala")).status_code == 401
        assert (await _login(client, email)).status_code == 429
    finally:
        await account_security.clear_failures(email)
    assert (await _login(client, email)).status_code == 200


async def test_suspended_gym_cannot_log_in(client):
    email, tenant_id = await _register(client)
    await _set_tenant(tenant_id, status=TenantStatus.suspended)
    r = await _login(client, email)
    assert r.status_code == 403
    assert "suspendida" in r.json()["detail"]


async def test_new_gym_starts_on_trial_and_read_only_blocks_writes(client):
    email, tenant_id = await _register(client)
    token = (await _login(client, email)).json()["access_token"]
    sub = (await client.get("/api/v1/settings/subscription", headers=_h(token))).json()
    assert sub["status"] == "trialing" and sub["days_left"] == settings.default_trial_days and sub["can_write"]

    # Prueba vencida hace más que la gracia → solo lectura.
    gone = today_bogota() - timedelta(days=settings.past_due_grace_days + 2)
    await _set_tenant(tenant_id, trial_ends_at=gone)
    sub = (await client.get("/api/v1/settings/subscription", headers=_h(token))).json()
    assert sub["status"] == "read_only" and sub["can_write"] is False

    r = await client.post("/api/v1/member-plans/", json={"name": "Mes", "price": 1000, "duration_days": 30},
                          headers=_h(token))
    assert r.status_code == 402 and r.json()["code"] == "read_only"
    assert (await client.get("/api/v1/members", headers=_h(token))).status_code == 200
    # Entrar al sistema sigue funcionando.
    assert (await client.post("/api/v1/auth/refresh", headers=_h(token))).status_code == 200

    # Cortesía vigente: vuelve a poder registrar.
    await _set_tenant(tenant_id, comp_until=today_bogota() + timedelta(days=30))
    r = await client.post("/api/v1/member-plans/", json={"name": "Mes", "price": 1000, "duration_days": 30},
                          headers=_h((await _login(client, email)).json()["access_token"]))
    assert r.status_code in (200, 201), r.text


def test_trial_runs_out_into_past_due_then_read_only():
    t = Tenant(name="x", slug="x", db_name="gym_x", **subscription.new_tenant_defaults())
    today = today_bogota()
    assert subscription.effective(t, today)["status"] == "trialing"
    t.trial_ends_at = today - timedelta(days=1)
    eff = subscription.effective(t, today)
    assert eff["status"] == "past_due" and eff["can_write"] and eff["days_left"] == settings.past_due_grace_days - 1
    t.trial_ends_at = today - timedelta(days=settings.past_due_grace_days + 1)
    assert subscription.effective(t, today)["status"] == "read_only"
    t.comp_until = today
    assert subscription.effective(t, today)["status"] == "comp"
    t.status = TenantStatus.suspended
    assert subscription.effective(t, today)["can_write"] is False


async def test_staff_login_with_two_step(client):
    from tests.test_users import create_owner_token, onboard_staff
    owner_token = await create_owner_token(client)
    email, password, staff_token = await onboard_staff(client, owner_token)
    secret, _ = await _enable_mfa(client, staff_token)
    r = await client.post("/api/v1/auth/staff/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    challenge = r.json()["challenge_token"]
    ok = await client.post("/api/v1/auth/mfa/verify",
                           json={"challenge_token": challenge, "code": totp.code_at(secret, time.time() + 30)})
    assert ok.status_code == 200, ok.text
    assert ok.json()["role"] == "receptionist"
    assert (await client.get("/api/v1/auth/mfa/status", headers=_h(ok.json()["access_token"]))).json()["enabled"]


async def test_same_code_with_spaces_is_still_a_replay(client):
    email, _ = await _register(client)
    token = (await _login(client, email)).json()["access_token"]
    secret, _ = await _enable_mfa(client, token)
    code = totp.code_at(secret, time.time() + 30)
    first = (await _login(client, email)).json()["challenge_token"]
    assert (await client.post("/api/v1/auth/mfa/verify", json={"challenge_token": first, "code": code})).status_code == 200
    spaced = f"{code[:3]} {code[3:]}"
    second = (await _login(client, email)).json()["challenge_token"]
    r = await client.post("/api/v1/auth/mfa/verify", json={"challenge_token": second, "code": spaced})
    assert r.status_code == 401


async def test_password_reset_ends_existing_sessions(client):
    email, _ = await _register(client)
    old = (await _login(client, email)).json()["access_token"]
    mailer.OUTBOX.clear()
    await client.post("/api/v1/auth/password/forgot", json={"email": email})
    token = re.search(r"token=([\w-]+)", mailer.OUTBOX[0].text).group(1)
    time.sleep(1.1)  # el corte es por segundo
    assert (await client.post("/api/v1/auth/password/reset", json={"token": token, "password": "NuevaClave2026!"})).status_code == 200
    assert (await client.get("/api/v1/members", headers=_h(old))).status_code == 401
    fresh = (await _login(client, email, "NuevaClave2026!")).json()["access_token"]
    assert (await client.get("/api/v1/members", headers=_h(fresh))).status_code == 200


async def test_suspension_ends_open_sessions(client):
    email, tenant_id = await _register(client)
    token = (await _login(client, email)).json()["access_token"]
    assert (await client.get("/api/v1/members", headers=_h(token))).status_code == 200
    await _set_tenant(tenant_id, status=TenantStatus.suspended)
    r = await client.get("/api/v1/members", headers=_h(token))
    assert r.status_code == 401 and "suspendida" in r.json()["detail"]
    assert (await client.post("/api/v1/auth/refresh", headers=_h(token))).status_code == 401
    await _set_tenant(tenant_id, status=TenantStatus.active)


async def test_invited_admin_must_set_up_two_step(client, mfa_required, monkeypatch):
    from tests.test_users import onboard_staff
    monkeypatch.setattr(settings, "mfa_required_roles", [])
    owner_email, _ = await _register(client)
    owner_token = (await _login(client, owner_email)).json()["access_token"]
    monkeypatch.setattr(settings, "mfa_required_roles", ["owner", "admin"])
    _, _, admin_token = await onboard_staff(client, owner_token, role="admin")
    r = await client.get("/api/v1/members", headers=_h(admin_token))
    assert r.status_code == 403 and r.json()["detail"] == "mfa_setup_required"


async def test_public_links_work_for_gyms_on_trial(client):
    """Un gimnasio recién creado está en prueba: el QR de sus máquinas debe abrir."""
    from tests.test_machines_negocio import _machine
    email, _ = await _register(client)
    token = (await _login(client, email)).json()["access_token"]
    m = await _machine(client, token)
    path = (await client.post(f"/api/v1/machines/{m['id']}/report-link", headers=_h(token))).json()["path"]
    _, _, slug, tok = path.split("/")
    assert (await client.get(f"/api/v1/public/machines/{slug}/{tok}")).status_code == 200
