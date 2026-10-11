"""Ajustes › Seguridad: dos pasos opcional con varios métodos, cambio de
contraseña con código, cambio de correo verificado y cerrar todas las sesiones."""
import re
import time
import uuid

from app.core import totp
from app.services import mailer
from tests.test_account_security import PASSWORD, _enable_mfa, _h, _login, _register


def _code_for(email: str) -> str:
    mail = [m for m in mailer.OUTBOX if m.to == email][-1]
    return re.match(r"(\d{6}) ", mail.subject).group(1)


async def _owner(client) -> tuple[str, str]:
    email, _ = await _register(client)
    r = await _login(client, email)
    assert r.status_code == 200, r.text
    return email, r.json()["access_token"]


async def test_two_step_is_not_forced_by_default(client):
    email, token = await _owner(client)
    r = await _login(client, email)
    assert r.json()["mfa_setup_required"] is False
    assert (await client.get("/api/v1/members", headers=_h(token))).status_code == 200
    status = (await client.get("/api/v1/auth/mfa/status", headers=_h(token))).json()
    assert status["enabled"] is False and status["required"] is False
    assert status["methods"] == {"totp": False, "email": False, "passkey": False}


async def test_email_method_end_to_end(client):
    email, token = await _owner(client)
    r = await client.post("/api/v1/auth/security/code", json={"purpose": "mfa_email"}, headers=_h(token))
    assert r.status_code == 200, r.text
    wrong = await client.post("/api/v1/auth/mfa/email/enable", json={"code": "000000"}, headers=_h(token))
    assert wrong.status_code == 400
    r = await client.post("/api/v1/auth/mfa/email/enable", json={"code": _code_for(email)}, headers=_h(token))
    assert r.status_code == 200, r.text
    assert len(r.json()["backup_codes"]) >= 8, "el primer método entrega códigos de respaldo"
    assert any("activaste" in m.subject for m in mailer.OUTBOX if m.to == email), "aviso de seguridad"

    challenge = (await _login(client, email)).json()
    assert challenge["methods"] == ["email", "backup"] and challenge["preferred"] == "email"
    assert challenge["email_hint"].endswith("@gym.com") and "•" in challenge["email_hint"]
    r = await client.post("/api/v1/auth/mfa/challenge/email", json={"challenge_token": challenge["challenge_token"]})
    assert r.status_code == 200, r.text
    # Pedir otro código enseguida no se permite (evita llenar el correo de códigos).
    again = await client.post("/api/v1/auth/mfa/challenge/email", json={"challenge_token": challenge["challenge_token"]})
    assert again.status_code == 429
    bad = await client.post("/api/v1/auth/mfa/verify", json={
        "challenge_token": challenge["challenge_token"], "code": "123123", "method": "email"})
    assert bad.status_code == 401
    ok = await client.post("/api/v1/auth/mfa/verify", json={
        "challenge_token": challenge["challenge_token"], "code": _code_for(email), "method": "email"})
    assert ok.status_code == 200, ok.text and ok.json()["access_token"]


async def test_second_method_keeps_the_same_backup_codes_and_preferred_can_change(client):
    email, token = await _owner(client)
    secret, enabled = await _enable_mfa(client, token)
    token = enabled["session"]["access_token"]
    await client.post("/api/v1/auth/security/code", json={"purpose": "mfa_email"}, headers=_h(token))
    r = await client.post("/api/v1/auth/mfa/email/enable", json={"code": _code_for(email)}, headers=_h(token))
    assert r.json()["backup_codes"] == []
    assert (await client.patch("/api/v1/auth/mfa/preferred", json={"method": "email"}, headers=_h(token))).status_code == 200
    challenge = (await _login(client, email)).json()
    assert challenge["methods"] == ["totp", "email", "backup"] and challenge["preferred"] == "email"
    # Sin `method`, el código de la app sigue sirviendo (compatibilidad). El de esta
    # ventana ya se usó al activarla: se toma el de la siguiente.
    ok = await client.post("/api/v1/auth/mfa/verify", json={
        "challenge_token": challenge["challenge_token"], "code": totp.code_at(secret, time.time() + 30)})
    assert ok.status_code == 200, ok.text


async def test_disabling_the_last_method_clears_backup_codes(client):
    email, token = await _owner(client)
    await client.post("/api/v1/auth/security/code", json={"purpose": "mfa_email"}, headers=_h(token))
    await client.post("/api/v1/auth/mfa/email/enable", json={"code": _code_for(email)}, headers=_h(token))
    await client.post("/api/v1/auth/security/code", json={"purpose": "mfa_disable"}, headers=_h(token))
    wrong_pass = await client.post("/api/v1/auth/mfa/disable", json={
        "method": "email", "password": "otra-cosa", "code": _code_for(email)}, headers=_h(token))
    assert wrong_pass.status_code == 400
    # La contraseña se revisa antes que el código: el código no se gastó.
    r = await client.post("/api/v1/auth/mfa/disable", json={
        "method": "email", "password": PASSWORD, "code": _code_for(email)}, headers=_h(token))
    assert r.status_code == 200, r.text and r.json()["enabled"] is False
    status = (await client.get("/api/v1/auth/mfa/status", headers=_h(token))).json()
    assert status["backup_codes_left"] == 0 and status["preferred"] is None
    assert "access_token" in (await _login(client, email)).json()


async def test_password_change_needs_a_code_and_updates_the_owner_login(client):
    email, token = await _owner(client)
    new = "OtraClave-2026!"
    no_code = await client.post("/api/v1/auth/password/change", json={
        "current_password": PASSWORD, "new_password": new, "code": "000000"}, headers=_h(token))
    assert no_code.status_code == 400
    r = await client.post("/api/v1/auth/security/code", json={"purpose": "password"}, headers=_h(token))
    assert r.status_code == 200
    wrong_current = await client.post("/api/v1/auth/password/change", json={
        "current_password": "no-es", "new_password": new, "code": _code_for(email)}, headers=_h(token))
    assert wrong_current.status_code == 400
    r = await client.post("/api/v1/auth/password/change", json={
        "current_password": PASSWORD, "new_password": new, "code": _code_for(email)}, headers=_h(token))
    assert r.status_code == 200, r.text
    fresh = r.json()["session"]["access_token"]

    # El bug de antes: la contraseña vieja seguía entrando por /auth/login.
    assert (await _login(client, email)).status_code == 401
    assert (await _login(client, email, new)).status_code == 200
    # Las sesiones abiertas antes del cambio se cierran; la de quien lo hizo sigue.
    assert (await client.get("/api/v1/members", headers=_h(token))).status_code == 401
    assert (await client.get("/api/v1/members", headers=_h(fresh))).status_code == 200
    assert any("contraseña cambió" in m.subject for m in mailer.OUTBOX if m.to == email)


async def test_password_change_with_the_authenticator_app(client):
    email, token = await _owner(client)
    secret, enabled = await _enable_mfa(client, token)
    token = enabled["session"]["access_token"]
    # El código con el que se activó ya se usó: se toma el de la ventana siguiente.
    code = totp.code_at(secret, time.time() + 30)
    r = await client.post("/api/v1/auth/password/change", json={
        "current_password": PASSWORD, "new_password": "ClaveNueva-77", "code": code, "method": "totp"},
        headers=_h(token))
    assert r.status_code == 200, r.text


async def test_profile_patch_no_longer_changes_password_or_email(client):
    email, token = await _owner(client)
    r = await client.patch("/api/v1/settings/profile", json={
        "current_password": PASSWORD, "new_password": "Cualquiera-123"}, headers=_h(token))
    assert r.status_code == 400 and "Seguridad" in r.json()["detail"]
    r = await client.patch("/api/v1/settings/profile", json={"email": f"x-{uuid.uuid4().hex[:6]}@gym.com"},
                           headers=_h(token))
    assert r.status_code == 400
    r = await client.patch("/api/v1/settings/profile", json={"full_name": "Dueña Renombrada"}, headers=_h(token))
    assert r.status_code == 200 and r.json()["full_name"] == "Dueña Renombrada"


async def test_email_change_is_confirmed_from_the_new_inbox(client):
    email, token = await _owner(client)
    new_email = f"nuevo-{uuid.uuid4().hex[:8]}@gym.com"
    bad = await client.post("/api/v1/auth/email/change/code", json={
        "new_email": new_email, "current_password": "no"}, headers=_h(token))
    assert bad.status_code == 400
    r = await client.post("/api/v1/auth/email/change/code", json={
        "new_email": new_email, "current_password": PASSWORD}, headers=_h(token))
    assert r.status_code == 200, r.text
    assert [m for m in mailer.OUTBOX if m.to == new_email], "el código va al correo NUEVO"
    r = await client.post("/api/v1/auth/email/change", json={"new_email": new_email, "code": _code_for(new_email)},
                          headers=_h(token))
    assert r.status_code == 200, r.text
    assert (await _login(client, new_email)).status_code == 200
    assert (await _login(client, email)).status_code == 401
    assert any("correo de acceso cambió" in m.subject for m in mailer.OUTBOX if m.to == email), "aviso al correo viejo"


async def test_email_change_rejects_an_email_already_in_use(client):
    email, token = await _owner(client)
    other, _ = await _owner(client)
    r = await client.post("/api/v1/auth/email/change/code", json={
        "new_email": other, "current_password": PASSWORD}, headers=_h(token))
    assert r.status_code == 409


async def test_revoke_all_sessions_keeps_only_the_current_one(client):
    email, token = await _owner(client)
    other = (await _login(client, email)).json()["access_token"]
    r = await client.post("/api/v1/auth/sessions/revoke-all", headers=_h(token))
    assert r.status_code == 200, r.text
    fresh = r.json()["session"]["access_token"]
    assert (await client.get("/api/v1/members", headers=_h(other))).status_code == 401
    assert (await client.get("/api/v1/members", headers=_h(fresh))).status_code == 200


async def test_passkey_registration_options_and_bad_credential(client):
    email, token = await _owner(client)
    r = await client.post("/api/v1/auth/mfa/passkeys/options", headers=_h(token))
    assert r.status_code == 200, r.text
    opts = r.json()
    assert opts["rp"]["name"] == "LSMFit" and opts["challenge"]
    assert opts["authenticatorSelection"]["userVerification"] == "required"
    bad = await client.post("/api/v1/auth/mfa/passkeys", json={"credential": {"id": "x"}, "name": "Mi PC"},
                            headers=_h(token))
    assert bad.status_code == 400
    # El desafío sirve una sola vez: un segundo intento ya no lo encuentra.
    again = await client.post("/api/v1/auth/mfa/passkeys", json={"credential": {"id": "x"}, "name": "Mi PC"},
                              headers=_h(token))
    assert again.status_code == 400 and "venció" in again.json()["detail"]


async def test_email_code_cannot_be_used_twice_concurrently(client):
    import asyncio
    from app.services import mfa
    email, token = await _owner(client)
    me = await client.get("/api/v1/auth/mfa/status", headers=_h(token))
    assert me.status_code == 200
    await client.post("/api/v1/auth/security/code", json={"purpose": "mfa_email"}, headers=_h(token))
    code = _code_for(email)
    from app.core.security import decode_token
    staff_id = decode_token(token)["staff_id"]
    results = await asyncio.gather(*(mfa.check_code(staff_id, "mfa_email", code) for _ in range(5)))
    assert results.count(True) == 1
