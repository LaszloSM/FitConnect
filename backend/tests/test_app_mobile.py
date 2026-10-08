"""App móvil: entrar con código, sesiones que rotan, vínculo con la ficha del
gimnasio, QR rotativo, clases, ficha, entrenos y borrar la cuenta."""
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.security import decode_token
from app.db.master_session import MasterSessionLocal
from app.models.master.tenant import Tenant
from app.services import app_accounts, mailer
from tests.helpers import create_member, create_plan
from tests.test_users import create_owner_token


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _email():
    return f"app-{uuid.uuid4().hex[:10]}@correo.com"


def _last_code(email: str) -> str:
    mail = [m for m in mailer.OUTBOX if m.to == email][-1]
    return re.search(r"\b(\d{6})\b", mail.subject).group(1)


async def _app_login(client, email=None, name="Ana Pérez"):
    email = email or _email()
    r = await client.post("/api/v1/app/auth/code", json={"email": email})
    assert r.status_code == 200, r.text
    r = await client.post("/api/v1/app/auth/verify", json={
        "email": email, "code": _last_code(email), "accept_terms": True, "full_name": name, "device_name": "Pixel"})
    assert r.status_code == 200, r.text
    return email, r.json()


async def _set_module(token: str, enabled: bool) -> Tenant:
    db_name = decode_token(token)["db_name"]
    async with MasterSessionLocal() as m:
        t = (await m.execute(select(Tenant).where(Tenant.db_name == db_name))).scalar_one()
        t.modules = {**(t.modules or {}), "member_app": enabled}
        await m.commit()
        return t


async def _linked(client, plan_kwargs=None):
    """Socio con membresía, vinculado a una cuenta nueva de la app."""
    owner = await create_owner_token(client)
    await _set_module(owner, True)
    plan_id = await create_plan(client, _h(owner), **(plan_kwargs or {}))
    member = await create_member(client, _h(owner), plan_id=plan_id)
    code = (await client.post(f"/api/v1/members/{member['id']}/app-code", headers=_h(owner))).json()["code"]
    _, tokens = await _app_login(client)
    r = await client.post("/api/v1/me/links", json={"code": code, "id_number": member["id_number"]},
                          headers=_h(tokens["access_token"]))
    assert r.status_code == 201, r.text
    return owner, member, tokens, r.json()["link_id"]


# ─── Entrar ───

async def test_first_login_needs_terms_and_does_not_burn_the_code(client):
    email = _email()
    await client.post("/api/v1/app/auth/code", json={"email": email})
    code = _last_code(email)
    r = await client.post("/api/v1/app/auth/verify", json={"email": email, "code": code})
    assert r.status_code == 428 and r.json()["detail"]["code"] == "terms_required"
    r = await client.post("/api/v1/app/auth/verify", json={"email": email, "code": code, "accept_terms": True})
    assert r.status_code == 200 and r.json()["created"] is True
    me = (await client.get("/api/v1/me", headers=_h(r.json()["access_token"]))).json()
    assert me["user"]["email"] == email and me["gyms"] == []


async def test_code_locks_after_five_wrong_attempts(client):
    email = _email()
    await client.post("/api/v1/app/auth/code", json={"email": email})
    code = _last_code(email)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        r = await client.post("/api/v1/app/auth/verify", json={"email": email, "code": wrong, "accept_terms": True})
        assert r.status_code == 400
    r = await client.post("/api/v1/app/auth/verify", json={"email": email, "code": code, "accept_terms": True})
    assert r.status_code == 400, "tras 5 intentos el código deja de servir aunque sea el correcto"


async def test_refresh_rotates_and_reuse_closes_every_session(client):
    _, t = await _app_login(client)
    r = await client.post("/api/v1/app/auth/refresh", json={"refresh_token": t["refresh_token"]})
    assert r.status_code == 200
    new = r.json()
    assert (await client.get("/api/v1/me", headers=_h(new["access_token"]))).status_code == 200
    # Alguien reusa el token viejo: se cierran todas las sesiones.
    stolen = await client.post("/api/v1/app/auth/refresh", json={"refresh_token": t["refresh_token"]})
    assert stolen.status_code == 401
    assert (await client.get("/api/v1/me", headers=_h(new["access_token"]))).status_code == 401
    assert (await client.post("/api/v1/app/auth/refresh", json={"refresh_token": new["refresh_token"]})).status_code == 401


async def test_app_and_staff_tokens_do_not_cross(client):
    owner = await create_owner_token(client)
    _, t = await _app_login(client)
    assert (await client.get("/api/v1/me", headers=_h(owner))).status_code == 401
    assert (await client.get("/api/v1/members", headers=_h(t["access_token"]))).status_code == 401


async def test_logout_cuts_access_immediately(client):
    _, t = await _app_login(client)
    await client.post("/api/v1/app/auth/logout", json={"refresh_token": t["refresh_token"]})
    assert (await client.get("/api/v1/me", headers=_h(t["access_token"]))).status_code == 401


# ─── Vínculo con el gimnasio ───

async def test_app_code_requires_the_module(client):
    owner = await create_owner_token(client)
    await _set_module(owner, False)
    member = await create_member(client, _h(owner))
    r = await client.post(f"/api/v1/members/{member['id']}/app-code", headers=_h(owner))
    assert r.status_code == 403
    await _set_module(owner, True)
    r = await client.post(f"/api/v1/members/{member['id']}/app-code", headers=_h(owner))
    assert r.status_code == 200 and re.fullmatch(r"[A-Z0-9]{4}-[A-Z0-9]{4}", r.json()["code"])


async def test_link_needs_the_right_document_and_a_new_account_replaces_the_old(client):
    owner, member, tokens, link_id = await _linked(client)
    status = (await client.get(f"/api/v1/members/{member['id']}/app-status", headers=_h(owner))).json()
    assert status["linked"] is True

    code = (await client.post(f"/api/v1/members/{member['id']}/app-code", headers=_h(owner))).json()["code"]
    _, other = await _app_login(client)
    bad = await client.post("/api/v1/me/links", json={"code": code, "id_number": "999999999"},
                            headers=_h(other["access_token"]))
    assert bad.status_code == 400
    ok = await client.post("/api/v1/me/links", json={"code": code.lower(), "id_number": member["id_number"]},
                           headers=_h(other["access_token"]))
    assert ok.status_code == 201
    # La cuenta anterior pierde el acceso a esa ficha.
    assert (await client.get(f"/api/v1/me/gyms/{link_id}", headers=_h(tokens["access_token"]))).status_code == 404
    # Y el código ya no sirve dos veces.
    again = await client.post("/api/v1/me/links", json={"code": code, "id_number": member["id_number"]},
                              headers=_h(tokens["access_token"]))
    assert again.status_code == 400


async def test_summary_shows_membership_and_hides_other_peoples_links(client):
    _, _, tokens, link_id = await _linked(client)
    r = await client.get(f"/api/v1/me/gyms/{link_id}", headers=_h(tokens["access_token"]))
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["membership"]["status"] == "ok" and s["membership"]["can_enter"] is True
    assert s["qr"]["prefix"] == "FC2." and len(s["qr"]["secret"]) >= 16
    _, stranger = await _app_login(client)
    assert (await client.get(f"/api/v1/me/gyms/{link_id}", headers=_h(stranger["access_token"]))).status_code == 404


async def test_module_turned_off_blocks_gym_routes(client):
    owner, _, tokens, link_id = await _linked(client)
    await _set_module(owner, False)
    try:
        r = await client.get(f"/api/v1/me/gyms/{link_id}", headers=_h(tokens["access_token"]))
        assert r.status_code == 403
        gyms = (await client.get("/api/v1/me", headers=_h(tokens["access_token"]))).json()["gyms"]
        assert gyms[0]["app_enabled"] is False
    finally:
        await _set_module(owner, True)


# ─── QR rotativo ───

async def test_rotating_qr_checks_in_and_dies_with_the_link(client):
    owner, member, tokens, link_id = await _linked(client)
    lid = uuid.UUID(link_id)
    payload = app_accounts.qr_payload(lid)
    r = await client.post(f"/api/v1/checkins/qr/{payload}", headers=_h(owner))
    assert r.status_code == 201, r.text
    assert r.json()["member_id"] == member["id"]

    old = app_accounts.qr_payload(lid, at=time.time() - 300)
    assert (await client.post(f"/api/v1/checkins/qr/{old}", headers=_h(owner))).status_code == 404

    await client.delete(f"/api/v1/me/links/{link_id}", headers=_h(tokens["access_token"]))
    fresh = app_accounts.qr_payload(lid)
    assert (await client.post(f"/api/v1/checkins/qr/{fresh}", headers=_h(owner))).status_code == 404


async def test_rotating_qr_from_another_gym_is_not_accepted(client):
    _, _, _, link_id = await _linked(client)
    assert await app_accounts.resolve_rotating_qr("gym_otro_inexistente", app_accounts.qr_payload(uuid.UUID(link_id))) is None


# ─── Clases ───

async def _class_tomorrow(client, owner):
    tomorrow = datetime.now(ZoneInfo("America/Bogota")).date() + timedelta(days=1)
    gc = (await client.post("/api/v1/classes", json={
        "name": f"Spinning {uuid.uuid4().hex[:5]}", "instructor": "Coach", "weekdays": [tomorrow.weekday()],
        "start_time": "10:00", "duration_minutes": 45, "max_capacity": 1,
    }, headers=_h(owner))).json()
    return gc["id"], tomorrow


async def test_member_books_and_cancels_from_the_app(client):
    owner, member, tokens, link_id = await _linked(client, {"access_type": "gym_and_classes"})
    gc_id, _ = await _class_tomorrow(client, owner)
    classes = (await client.get(f"/api/v1/me/gyms/{link_id}/classes", headers=_h(tokens["access_token"]))).json()
    mine = [c for c in classes if c["class_name"].startswith("Spinning") and c["capacity"] == 1 and c["booked"] == 0]
    assert mine, classes
    sid = mine[0]["session_id"]
    r = await client.post(f"/api/v1/me/gyms/{link_id}/classes/{sid}/book", headers=_h(tokens["access_token"]))
    assert r.status_code == 201 and r.json()["status"] == "booked", r.text
    dup = await client.post(f"/api/v1/me/gyms/{link_id}/classes/{sid}/book", headers=_h(tokens["access_token"]))
    assert dup.status_code == 400

    # Otro socio queda en lista de espera y no puede cancelar la reserva ajena.
    _, _, tokens2, link2 = await _linked(client, {"access_type": "gym_and_classes"})
    r2 = await client.post(f"/api/v1/me/gyms/{link2}/classes/{sid}/book", headers=_h(tokens2["access_token"]))
    assert r2.json()["status"] == "waitlisted"
    steal = await client.delete(f"/api/v1/me/gyms/{link2}/classes/{sid}/book/{r.json()['booking_id']}",
                                headers=_h(tokens2["access_token"]))
    assert steal.status_code == 404
    ok = await client.delete(f"/api/v1/me/gyms/{link_id}/classes/{sid}/book/{r.json()['booking_id']}",
                             headers=_h(tokens["access_token"]))
    assert ok.status_code == 200
    after = (await client.get(f"/api/v1/me/gyms/{link2}/classes", headers=_h(tokens2["access_token"]))).json()
    assert [c for c in after if c["session_id"] == sid][0]["my_booking"]["status"] == "booked", "promovido de la lista"


# ─── Ficha, pagos y planes ───

async def test_member_sees_own_data_and_completes_only_empty_fields(client):
    _, member, tokens, link_id = await _linked(client)
    prof = (await client.get(f"/api/v1/me/gyms/{link_id}/profile", headers=_h(tokens["access_token"]))).json()
    assert prof["data"]["id_number"] == member["id_number"]
    r = await client.post(f"/api/v1/me/gyms/{link_id}/profile", json={
        "phone": "3000000000", "eps": "Sura", "accept_data": True}, headers=_h(tokens["access_token"]))
    assert r.status_code == 200, r.text
    assert "phone" not in r.json()["filled"], "un teléfono ya registrado no se cambia desde la app"
    pays = await client.get(f"/api/v1/me/gyms/{link_id}/payments", headers=_h(tokens["access_token"]))
    plans = await client.get(f"/api/v1/me/gyms/{link_id}/plans", headers=_h(tokens["access_token"]))
    assert pays.status_code == 200 and plans.status_code == 200
    assert all(p["name"] != "Cortesía del equipo" for p in plans.json()["plans"])


async def test_renew_without_wompi_says_to_pay_at_reception(client):
    _, _, tokens, link_id = await _linked(client)
    plans = (await client.get(f"/api/v1/me/gyms/{link_id}/plans", headers=_h(tokens["access_token"]))).json()
    if plans["online_payments"]:
        return
    r = await client.post(f"/api/v1/me/gyms/{link_id}/renew", json={"plan_id": plans["plans"][0]["id"]},
                          headers=_h(tokens["access_token"]))
    assert r.status_code == 409


# ─── Datos de la persona ───

async def test_weight_needs_health_consent_and_revoking_erases_it(client):
    _, t = await _app_login(client)
    h = _h(t["access_token"])
    assert (await client.patch("/api/v1/me", json={"weight_kg": 70}, headers=h)).status_code == 422
    await client.post("/api/v1/me/consents", json={"kind": "health", "granted": True}, headers=h)
    r = await client.patch("/api/v1/me", json={"weight_kg": 70, "height_cm": 170, "goal": "gain_muscle"}, headers=h)
    assert r.status_code == 200 and r.json()["profile"]["weight_kg"] == 70
    await client.post("/api/v1/me/consents", json={"kind": "health", "granted": False}, headers=h)
    prof = (await client.get("/api/v1/me", headers=h)).json()["profile"]
    assert prof["weight_kg"] is None and prof["height_cm"] is None and prof["goal"] == "gain_muscle"


async def test_workouts_are_idempotent_and_feed_progress(client):
    _, t = await _app_login(client)
    h = _h(t["access_token"])
    wid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    body = {"id": wid, "title": "Pierna", "started_at": (now - timedelta(hours=1)).isoformat(), "ended_at": now.isoformat(),
            "entries": [{"exercise_name": "Sentadilla", "sets": [{"reps": 8, "weight_kg": 60}, {"reps": 6, "weight_kg": 70}]}]}
    assert (await client.post("/api/v1/me/workouts", json=body, headers=h)).json()["status"] == "created"
    assert (await client.post("/api/v1/me/workouts", json=body, headers=h)).json()["status"] == "duplicate"
    assert len((await client.get("/api/v1/me/workouts", headers=h)).json()) == 1
    prog = (await client.get("/api/v1/me/progress", headers=h)).json()
    assert prog[0]["best_kg"] == 70 and prog[0]["sessions"] == 1
    # El id de otra persona no se pisa.
    _, other = await _app_login(client)
    assert (await client.post("/api/v1/me/workouts", json=body, headers=_h(other["access_token"]))).status_code == 409


async def test_delete_account_erases_everything_but_the_gym_record(client):
    owner, member, tokens, _ = await _linked(client)
    h = _h(tokens["access_token"])
    await client.post("/api/v1/me/workouts", json={
        "id": str(uuid.uuid4()), "title": "Libre", "started_at": datetime.now(timezone.utc).isoformat(), "entries": []},
        headers=h)
    assert (await client.delete("/api/v1/me", headers=h)).status_code == 204
    assert (await client.get("/api/v1/me", headers=h)).status_code == 401
    assert (await client.get(f"/api/v1/members/{member['id']}", headers=_h(owner))).status_code == 200
    status = (await client.get(f"/api/v1/members/{member['id']}/app-status", headers=_h(owner))).json()
    assert status["linked"] is False


async def test_offline_snapshot_carries_only_todays_and_tomorrows_qr_keys(client):
    from app.core.timeutil import today_bogota
    owner, member, _, link_id = await _linked(client)
    snap = (await client.get("/api/v1/offline/snapshot", headers=_h(owner))).json()
    entry = snap["app_qr"][uuid.UUID(link_id).hex]
    today = today_bogota()
    assert entry["member_id"] == member["id"]
    assert set(entry["keys"]) == {today.isoformat(), (today + timedelta(days=1)).isoformat()}
    assert app_accounts.qr_secret(uuid.UUID(link_id)) not in str(snap), "la llave base nunca sale del servidor"
    # Una llave de un día no genera códigos válidos otro día.
    from app.core import totp
    next_week = time.time() + 7 * 86400
    code = totp.code_at(entry["keys"][today.isoformat()], next_week)
    assert not app_accounts.verify_qr_code(uuid.UUID(link_id), code, at=next_week)


async def test_announcement_reaches_the_phone_only_with_consent(client):
    from app.services import push
    owner, member, tokens, link_id = await _linked(client)
    h = _h(tokens["access_token"])
    token = f"ExponentPushToken[{uuid.uuid4().hex[:16]}]"
    assert (await client.post("/api/v1/me/push-token", json={"token": token}, headers=h)).status_code == 422
    await client.post("/api/v1/me/consents", json={"kind": "notifications", "granted": True}, headers=h)
    assert (await client.post("/api/v1/me/push-token", json={"token": token, "platform": "android"},
                              headers=h)).status_code == 200
    push.OUTBOX.clear()
    r = await client.post("/api/v1/messages/announcements", json={
        "title": "Cerramos el festivo", "body": "Hola {nombre}, el lunes no abrimos.", "segment": "all_members"},
        headers={**_h(owner), "Idempotency-Key": uuid.uuid4().hex})
    assert r.status_code == 201, r.text
    assert any(p.token == token and p.body == "Cerramos el festivo" for p in push.OUTBOX)
    feed = (await client.get(f"/api/v1/me/gyms/{link_id}/announcements", headers=h)).json()
    first = member["full_name"].split(" ")[0].title()
    assert feed[0]["body"] == f"Hola {first}, el lunes no abrimos."
    # Retirar el permiso borra el token: no le llega nada más.
    await client.post("/api/v1/me/consents", json={"kind": "notifications", "granted": False}, headers=h)
    assert await push._tokens_for_members(decode_token(owner)["db_name"], [uuid.UUID(member["id"])]) == []


# Vector compartido con mobile/scripts/qr.test.mts y frontend (lib/offline/appQr.ts):
# si alguien cambia el algoritmo en un lado, esta prueba y la del celular se rompen.
QR_VECTOR = [(1791435599.0, "525483"), (1791435600.0, "473293"), (1791478799.0, "604036")]


def test_qr_algorithm_matches_the_shared_vector():
    for at, code in QR_VECTOR:
        assert app_accounts.code_for_secret("JBSWY3DPEHPK3PXP", at) == code
