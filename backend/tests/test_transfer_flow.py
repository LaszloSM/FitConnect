import uuid
from datetime import date

from tests.helpers import create_member_without_membership


_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="transfer@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Transfer", "gym_name": "Transfer Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _create_member(client, token):
    member = await create_member_without_membership(client, _auth(token), full_name="Miembro Transfer")
    return member["id"]


async def _create_plan(client, token, price=80000.0, duration_days=30):
    r = await client.post("/api/v1/member-plans/", json={
        "name": f"Plan {uuid.uuid4().hex[:6]}", "price": price, "duration_days": duration_days,
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ─── Cobro por transferencia: pendiente hasta confirmar ──────────────────────

async def test_charge_transfer_stays_pending_without_receipt(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token)

    r = await client.post("/api/v1/member-plans/charge", json={
        "member_id": member_id, "plan_id": plan_id, "method": "transfer",
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["payment_status"] == "pending"
    assert body["receipt_number"] is None

    # Sin recibo mientras esté pendiente
    r = await client.get(f"/api/v1/payments/{body['payment_id']}/receipt", headers=_auth(token))
    assert r.status_code == 404

    # La membresía sí se crea (encadenada/activa)
    memberships = (await client.get(
        f"/api/v1/members/{member_id}/memberships", headers=_auth(token)
    )).json()
    assert any(m["id"] == body["membership_id"] for m in memberships)


async def test_mark_paid_confirms_transfer_and_issues_receipt(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)
    plan_id = await _create_plan(client, token)

    charge = (await client.post("/api/v1/member-plans/charge", json={
        "member_id": member_id, "plan_id": plan_id, "method": "transfer",
    }, headers=_auth(token))).json()

    r = await client.patch(f"/api/v1/payments/{charge['payment_id']}/mark-paid", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"

    r = await client.get(f"/api/v1/payments/{charge['payment_id']}/receipt", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["number"]


async def test_create_payment_transfer_forced_to_pending(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)

    # El frontend manda status=paid; el backend lo fuerza a pending por ser transferencia
    r = await client.post("/api/v1/payments", json={
        "member_id": member_id, "amount": 25000, "method": "transfer",
        "status": "paid", "concept": "Abono prueba",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "pending"


async def test_void_pending_payment(client):
    token = await _owner_token(client)
    member_id = await _create_member(client, token)

    payment = (await client.post("/api/v1/payments", json={
        "member_id": member_id, "amount": 30000, "method": "transfer",
        "status": "pending", "concept": "Transferencia que nunca llegó",
    }, headers=_auth(token))).json()

    r = await client.post(f"/api/v1/payments/{payment['id']}/void", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "voided"

    # No se puede anular dos veces
    r = await client.post(f"/api/v1/payments/{payment['id']}/void", headers=_auth(token))
    assert r.status_code == 400


# ─── Settings de recaudo y datos fiscales ────────────────────────────────────

async def test_billing_settings_roundtrip(client):
    token = await _owner_token(client)

    r = await client.patch("/api/v1/settings/billing", json={
        "transfer_accounts": [
            {"type": "nequi", "label": "Nequi del gym", "account_number": "3001234567",
             "holder_name": "Transfer Gym SAS"},
        ],
        "legal_name": "Transfer Gym SAS",
        "nit": "900123456-7",
        "tax_regime": "Simple",
    }, headers=_auth(token))
    assert r.status_code == 200, r.text

    r = await client.get("/api/v1/settings/billing", headers=_auth(token))
    body = r.json()
    assert body["transfer_accounts"][0]["account_number"] == "3001234567"
    assert body["nit"] == "900123456-7"


async def test_billing_settings_rejects_unknown_account_type(client):
    token = await _owner_token(client)
    r = await client.patch("/api/v1/settings/billing", json={
        "transfer_accounts": [
            {"type": "paypal", "label": "x", "account_number": "123", "holder_name": "y"},
        ],
    }, headers=_auth(token))
    assert r.status_code == 422
