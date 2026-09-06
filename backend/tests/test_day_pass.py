"""Pase del día: registro exprés, venta por método, acceso por check-in y
conversión a socio."""
import uuid
from datetime import timedelta

from sqlalchemy import text

from app.core.timeutil import today_bogota
from tests.helpers import full_member_fields, create_plan

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="daypass@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Pase", "gym_name": "Pase Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _disable_shifts(client, token):
    r = await client.patch("/api/v1/settings/operations", json={"cash_shifts_enabled": False}, headers=_auth(token))
    assert r.status_code == 200, r.text


async def _pass_type(client, token, price=15000, trainer=False, name=None):
    r = await client.post("/api/v1/day-passes/types", json={
        "name": name or f"Pase {uuid.uuid4().hex[:5]}", "price": price, "includes_trainer": trainer,
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _transfer_account(client, token):
    r = await client.patch("/api/v1/settings/billing", json={"transfer_accounts": [
        {"type": "nequi", "label": "Nequi gym", "account_number": "3001112233", "holder_name": "Gym", "breb_key": "@gymnequi"},
    ]}, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["transfer_accounts"][0]


def _cedula():
    return str(uuid.uuid4().int)[:10]


# ─── Tipos ────────────────────────────────────────────────────────────────────

async def test_pass_types_crud_and_archive(client):
    token = await _owner_token(client)
    created = await _pass_type(client, token, name="Día con entrenador", trainer=True)
    assert created["includes_trainer"] is True

    r = await client.put(f"/api/v1/day-passes/types/{created['id']}", json={"price": 20000}, headers=_auth(token))
    assert r.status_code == 200 and float(r.json()["price"]) == 20000

    r = await client.delete(f"/api/v1/day-passes/types/{created['id']}", headers=_auth(token))
    assert r.status_code == 200 and r.json()["archived"] is True
    active = (await client.get("/api/v1/day-passes/types", headers=_auth(token))).json()
    assert all(t["id"] != created["id"] for t in active)
    everything = (await client.get("/api/v1/day-passes/types?include_inactive=true", headers=_auth(token))).json()
    assert any(t["id"] == created["id"] for t in everything)


# ─── Venta en efectivo: visitante nuevo, pago day_pass, pase activo, acceso ──

async def test_sell_cash_creates_visitor_and_grants_access(client):
    token = await _owner_token(client)
    await _disable_shifts(client, token)
    ptype = await _pass_type(client, token, price=15000)
    cedula = _cedula()

    r = await client.post("/api/v1/day-passes/sell", json={
        "id_number": cedula, "full_name": "Visitante Uno", "phone": "3009998877",
        "pass_type_id": ptype["id"], "method": "cash",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_new_visitor"] is True
    assert body["payment_status"] == "paid"
    assert body["receipt_number"]
    assert body["day_pass"]["status"] == "active"
    assert body["day_pass"]["valid_on"] == today_bogota().isoformat()

    payment = (await client.get(f"/api/v1/payments/{body['payment_id']}", headers=_auth(token))).json()
    assert payment["kind"] == "day_pass"
    assert float(payment["amount"]) == 15000

    member = (await client.get(f"/api/v1/members/{body['member_id']}", headers=_auth(token))).json()
    assert member["member_type"] == "visitor"
    assert member["email"] is None
    assert member["id_number"] == cedula

    # Check-in de recepción: permitido aunque no tenga membresía
    r = await client.post("/api/v1/checkins", json={"member_id": body["member_id"]}, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["decision"] == "allowed"
    assert r.json()["membership_status"] == "ok"

    # Ingresos ilimitados en el día: el segundo check-in seguido se rechaza solo
    # por la ventana corta anti doble toque (2 min), no por falta de derecho.
    r = await client.post("/api/v1/checkins", json={"member_id": body["member_id"]}, headers=_auth(token))
    assert r.status_code == 409

    # Aparece en la lista de pases de hoy
    today_list = (await client.get("/api/v1/day-passes", headers=_auth(token))).json()
    assert any(p["member_id"] == body["member_id"] and p["member_name"] == "Visitante Uno" for p in today_list)
    summary = (await client.get("/api/v1/day-passes/summary", headers=_auth(token))).json()
    assert summary["active"]["count"] >= 1


async def test_second_pass_same_day_rejected_and_cedula_reused(client):
    token = await _owner_token(client)
    await _disable_shifts(client, token)
    ptype = await _pass_type(client, token)
    cedula = _cedula()
    first = await client.post("/api/v1/day-passes/sell", json={
        "id_number": cedula, "full_name": "Repetido", "pass_type_id": ptype["id"], "method": "cash",
    }, headers=_auth(token))
    assert first.status_code == 201
    again = await client.post("/api/v1/day-passes/sell", json={
        "id_number": cedula, "full_name": "Repetido", "pass_type_id": ptype["id"], "method": "cash",
    }, headers=_auth(token))
    assert again.status_code == 409
    assert "ya tiene un pase" in again.json()["detail"]
    # La cédula no se duplicó como miembro
    members = (await client.get("/api/v1/members", params={"id_number": cedula}, headers=_auth(token))).json()
    assert len(members) == 1


async def test_pass_from_yesterday_does_not_grant_access(client):
    token = await _owner_token(client)
    await _disable_shifts(client, token)
    ptype = await _pass_type(client, token)
    r = await client.post("/api/v1/day-passes/sell", json={
        "id_number": _cedula(), "full_name": "Ayer", "pass_type_id": ptype["id"], "method": "cash",
    }, headers=_auth(token))
    body = r.json()

    # Retroceder el pase un día directamente en la tenant DB
    from app.db.tenant_session import get_tenant_engine
    from app.core.security import decode_token
    from app.core.config import settings
    db_name = decode_token(token)["db_name"]
    engine = get_tenant_engine(settings.tenant_database_url_template.replace("{db_name}", db_name))
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE day_passes SET valid_on = :d WHERE id = :id"),
            {"d": today_bogota() - timedelta(days=1), "id": uuid.UUID(body["day_pass"]["id"])},
        )

    r = await client.post("/api/v1/checkins", json={"member_id": body["member_id"]}, headers=_auth(token))
    assert r.status_code == 201
    assert r.json()["decision"] == "denied"
    assert r.json()["denial_reason"] == "no_membership"


# ─── Transferencia: pendiente hasta confirmar ─────────────────────────────────

async def test_sell_transfer_pending_until_confirmed(client):
    token = await _owner_token(client)
    account = await _transfer_account(client, token)
    ptype = await _pass_type(client, token, price=12000)
    r = await client.post("/api/v1/day-passes/sell", json={
        "id_number": _cedula(), "full_name": "Transfer Pase",
        "pass_type_id": ptype["id"], "method": "transfer", "transfer_account_id": account["id"],
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["payment_status"] == "pending"
    assert body["day_pass"]["status"] == "pending"
    assert body["transfer_reference"] and body["transfer_reference"].startswith("FC-")
    assert body["destination_account"]["breb_key"] == "@gymnequi"
    assert body["receipt_number"] is None

    # Sin confirmar no entra
    r = await client.post("/api/v1/checkins", json={"member_id": body["member_id"]}, headers=_auth(token))
    assert r.json()["decision"] == "denied"

    # Aparece en la bandeja por confirmar
    pending = (await client.get("/api/v1/payments/pending-transfers", headers=_auth(token))).json()
    row = next(p for p in pending if p["id"] == body["payment_id"])
    assert row["transfer_reference"] == body["transfer_reference"]
    assert row["elapsed_minutes"] >= 0
    assert row["destination_account"]["label"] == "Nequi gym"

    # Confirmar: recibo + pase activo + acceso
    r = await client.patch(f"/api/v1/payments/{body['payment_id']}/mark-paid", headers=_auth(token))
    assert r.status_code == 200, r.text
    passes = (await client.get("/api/v1/day-passes", headers=_auth(token))).json()
    assert next(p for p in passes if p["id"] == body["day_pass"]["id"])["status"] == "active"
    r = await client.post("/api/v1/checkins", json={"member_id": body["member_id"]}, headers=_auth(token))
    assert r.json()["decision"] == "allowed"


async def test_void_transfer_voids_pass(client):
    token = await _owner_token(client)
    await _transfer_account(client, token)
    ptype = await _pass_type(client, token)
    body = (await client.post("/api/v1/day-passes/sell", json={
        "id_number": _cedula(), "full_name": "Nunca Pagó", "pass_type_id": ptype["id"], "method": "transfer",
    }, headers=_auth(token))).json()
    r = await client.post(f"/api/v1/payments/{body['payment_id']}/void", json={"reason": "No llegó"}, headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "failed"
    assert r.json()["void_reason"] == "No llegó"
    passes = (await client.get("/api/v1/day-passes", headers=_auth(token))).json()
    assert next(p for p in passes if p["id"] == body["day_pass"]["id"])["status"] == "void"


async def test_transfer_without_configured_account_still_gets_reference(client):
    token = await _owner_token(client, email="daypass-noacc@gym.com")
    ptype = await _pass_type(client, token)
    r = await client.post("/api/v1/day-passes/sell", json={
        "id_number": _cedula(), "full_name": "Sin Cuenta", "pass_type_id": ptype["id"], "method": "transfer",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["payment_status"] == "pending"
    assert r.json()["destination_account"] is None
    assert r.json()["transfer_reference"]


# ─── Convertir visitante en socio ─────────────────────────────────────────────

async def test_convert_visitor_to_member_keeps_cedula_and_creates_membership(client):
    token = await _owner_token(client)
    await _disable_shifts(client, token)
    ptype = await _pass_type(client, token)
    cedula = _cedula()
    body = (await client.post("/api/v1/day-passes/sell", json={
        "id_number": cedula, "full_name": "Futuro Socio", "pass_type_id": ptype["id"], "method": "cash",
    }, headers=_auth(token))).json()
    plan_id = await create_plan(client, _auth(token))

    payload = full_member_fields(full_name="Futuro Socio", id_number=cedula)
    payload["plan_id"] = plan_id
    r = await client.post(f"/api/v1/members/{body['member_id']}/convert-to-member", json=payload, headers=_auth(token))
    assert r.status_code == 200, r.text
    member = r.json()
    assert member["member_type"] == "member"
    assert member["id_number"] == cedula
    assert member["email"] == payload["email"]

    memberships = (await client.get(f"/api/v1/members/{body['member_id']}/memberships", headers=_auth(token))).json()
    assert len(memberships) == 1 and memberships[0]["effective_status"] == "active"

    # Ya socio: convertir de nuevo no procede
    r = await client.post(f"/api/v1/members/{body['member_id']}/convert-to-member", json=payload, headers=_auth(token))
    assert r.status_code == 400


# ─── Reportes ────────────────────────────────────────────────────────────────

async def test_reports_by_kind_and_day_passes(client):
    token = await _owner_token(client)
    await _disable_shifts(client, token)
    ptype = await _pass_type(client, token, price=10000, name="Reporte Pase")
    await client.post("/api/v1/day-passes/sell", json={
        "id_number": _cedula(), "full_name": "Rep Uno", "pass_type_id": ptype["id"], "method": "cash",
    }, headers=_auth(token))
    kinds = (await client.get("/api/v1/reports/revenue-by-kind", headers=_auth(token))).json()
    assert kinds["by_kind"]["day_pass"]["amount"] >= 10000
    assert kinds["by_kind"]["day_pass"]["by_method"]["cash"] >= 10000

    passes = (await client.get("/api/v1/reports/day-passes", headers=_auth(token))).json()
    assert any(t["name"] == "Reporte Pase" for t in passes["by_type"])
    assert passes["total_count"] >= 1

    cash = (await client.get("/api/v1/payments/cash", headers=_auth(token))).json()
    assert cash["today"]["by_kind"]["day_pass"] >= 10000


# ─── Anular la transferencia de una membresía la deja sin efecto ─────────────

async def test_void_transfer_cancels_unpaid_membership(client):
    from tests.helpers import create_member_without_membership
    token = await _owner_token(client)
    member = await create_member_without_membership(client, _auth(token), full_name="Socio Transfer Void")
    plan_id = await create_plan(client, _auth(token))
    r = await client.post("/api/v1/member-plans/charge", json={
        "member_id": member["id"], "plan_id": plan_id, "method": "transfer",
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["transfer_reference"]
    payment_id = r.json()["payment_id"]

    r = await client.post(f"/api/v1/payments/{payment_id}/void", json={"reason": "no llegó"}, headers=_auth(token))
    assert r.status_code == 200, r.text
    memberships = (await client.get(f"/api/v1/members/{member['id']}/memberships", headers=_auth(token))).json()
    assert all(m["effective_status"] == "cancelled" for m in memberships)
    r = await client.post("/api/v1/checkins", json={"member_id": member["id"]}, headers=_auth(token))
    assert r.json()["decision"] == "denied"


async def test_member_with_active_plan_keeps_membership_over_pass(client):
    from tests.helpers import create_member
    token = await _owner_token(client)
    await _disable_shifts(client, token)
    member = await create_member(client, _auth(token), full_name="Socio Con Pase")
    ptype = await _pass_type(client, token, trainer=True)
    r = await client.post("/api/v1/day-passes/sell", json={
        "id_number": member["id_number"], "full_name": member["full_name"],
        "pass_type_id": ptype["id"], "method": "cash",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["is_new_visitor"] is False
    r = await client.post("/api/v1/checkins", json={"member_id": member["id"]}, headers=_auth(token))
    assert r.json()["decision"] == "allowed"
    # Sigue siendo socio (no se degrada a visitante)
    m = (await client.get(f"/api/v1/members/{member['id']}", headers=_auth(token))).json()
    assert m["member_type"] == "member"
