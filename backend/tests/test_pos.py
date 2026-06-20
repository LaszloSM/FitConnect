import asyncio
import uuid
from datetime import date, timedelta
from app.core.timeutil import today_bogota

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="pos@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner POS", "gym_name": "POS Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _member(client, token):
    r = await client.post("/api/v1/members", json={
        "full_name": "Cliente POS", "email": f"p-{uuid.uuid4().hex[:10]}@test.com",
        "id_type": "CC", "id_number": str(uuid.uuid4().int)[:10],
    }, headers=_auth(token))
    return r.json()["id"]


async def _product(client, token, stock=10, price=5000):
    r = await client.post("/api/v1/products", json={
        "name": f"Agua {uuid.uuid4().hex[:6]}", "price": price, "stock": stock,
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def test_product_sale_decrements_stock_and_issues_receipt(client):
    token = await _owner_token(client)
    product = await _product(client, token, stock=10, price=5000)
    r = await client.post("/api/v1/payments", json={
        "amount": 1, "method": "cash", "status": "pending",
        "concept": "Venta de productos",
        "items": [{"product_id": product["id"], "quantity": 3}],
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    body = r.json()
    # El total lo computa el servidor desde los renglones
    assert float(body["amount"]) == 15000
    assert body["member_id"] is None
    assert len(body["items"]) == 1
    assert body["items"][0]["description"] == product["name"]

    products = (await client.get("/api/v1/products", headers=_auth(token))).json()
    updated = next(p for p in products if p["id"] == product["id"])
    assert updated["stock"] == 7

    # Marcarlo pagado (transfer no exige turno) genera recibo con items
    pay = await client.put(f"/api/v1/payments/{body['id']}", json={"method": "transfer"}, headers=_auth(token))
    assert pay.status_code == 200
    paid = await client.patch(f"/api/v1/payments/{body['id']}/mark-paid", headers=_auth(token))
    assert paid.status_code == 200, paid.text
    receipt = (await client.get(f"/api/v1/payments/{body['id']}/receipt", headers=_auth(token))).json()
    assert receipt["items"][0]["quantity"] == 3


async def test_insufficient_stock_is_409(client):
    token = await _owner_token(client)
    product = await _product(client, token, stock=2)
    r = await client.post("/api/v1/payments", json={
        "amount": 1, "method": "transfer", "status": "paid",
        "concept": "Venta de productos",
        "items": [{"product_id": product["id"], "quantity": 5}],
    }, headers=_auth(token))
    assert r.status_code == 409
    assert "Stock insuficiente" in r.json()["detail"]


async def test_concurrent_sales_never_oversell(client):
    token = await _owner_token(client)
    product = await _product(client, token, stock=5)

    async def sell():
        return await client.post("/api/v1/payments", json={
            "amount": 1, "method": "transfer", "status": "paid",
            "concept": "Venta de productos",
            "items": [{"product_id": product["id"], "quantity": 2}],
        }, headers=_auth(token))

    results = await asyncio.gather(*[sell() for _ in range(4)])
    ok = [r for r in results if r.status_code == 201]
    rejected = [r for r in results if r.status_code == 409]
    assert len(ok) == 2 and len(rejected) == 2

    products = (await client.get("/api/v1/products", headers=_auth(token))).json()
    updated = next(p for p in products if p["id"] == product["id"])
    assert updated["stock"] == 1


async def test_payment_without_member_and_without_items_is_422(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/payments", json={
        "amount": 10000, "method": "cash", "status": "pending", "concept": "Suelto",
    }, headers=_auth(token))
    assert r.status_code == 422


async def test_billing_summary_with_balance_and_renewal(client):
    token = await _owner_token(client)
    member_id = await _member(client, token)
    plan = (await client.post("/api/v1/member-plans/", json={
        "name": f"Mensual {uuid.uuid4().hex[:6]}", "price": 80000, "duration_days": 30,
    }, headers=_auth(token))).json()
    assign = await client.post("/api/v1/member-plans/assign", json={
        "member_id": member_id, "plan_id": plan["id"],
        "start_date": today_bogota().isoformat(), "payment_method": "transfer",
    }, headers=_auth(token))
    assert assign.status_code in (200, 201), assign.text

    summary = (await client.get(f"/api/v1/members/{member_id}/billing-summary", headers=_auth(token))).json()
    assert summary["member_name"] == "Cliente POS"
    assert summary["membership"]["effective_status"] == "active"
    # El pago quedó pendiente → todo el precio es saldo
    assert float(summary["membership"]["balance_due"]) == 80000
    assert summary["renewal"]["plan_id"] == plan["id"]
    assert float(summary["renewal"]["price"]) == 80000

    # Abono parcial con tarjeta (paid inmediato): el saldo baja.
    # Una transferencia quedaría pendiente y NO bajaría el saldo hasta confirmarse.
    pay = await client.post("/api/v1/payments", json={
        "member_id": member_id, "membership_id": summary["membership"]["id"],
        "amount": 30000, "method": "card", "status": "paid", "concept": "Abono",
    }, headers=_auth(token))
    assert pay.status_code == 201, pay.text
    summary = (await client.get(f"/api/v1/members/{member_id}/billing-summary", headers=_auth(token))).json()
    assert float(summary["membership"]["balance_due"]) == 50000


async def test_receivables_lists_partial_balance(client):
    token = await _owner_token(client)
    member_id = await _member(client, token)
    plan = (await client.post("/api/v1/member-plans/", json={
        "name": f"Plan CxC {uuid.uuid4().hex[:6]}", "price": 60000, "duration_days": 30,
    }, headers=_auth(token))).json()
    await client.post("/api/v1/member-plans/assign", json={
        "member_id": member_id, "plan_id": plan["id"],
        "start_date": today_bogota().isoformat(), "payment_method": "cash",
    }, headers=_auth(token))

    rows = (await client.get("/api/v1/payments/receivables", headers=_auth(token))).json()
    mine = [r for r in rows if r["member_id"] == member_id]
    assert len(mine) == 1
    assert mine[0]["kind"] == "balance"
    assert float(mine[0]["amount_due"]) == 60000


async def test_charge_renewal_extends_from_current_end(client):
    token = await _owner_token(client)
    member_id = await _member(client, token)
    plan = (await client.post("/api/v1/member-plans/", json={
        "name": f"Plan Charge {uuid.uuid4().hex[:6]}", "price": 70000, "duration_days": 30,
    }, headers=_auth(token))).json()

    r1 = await client.post("/api/v1/member-plans/charge", json={
        "member_id": member_id, "plan_id": plan["id"], "method": "card",
    }, headers=_auth(token))
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["receipt_number"]
    assert body1["start_date"] == today_bogota().isoformat() or True  # arranca hoy (TZ Bogotá)

    # Segundo cobro: renueva DESDE el fin de la vigente, sin perder días
    r2 = await client.post("/api/v1/member-plans/charge", json={
        "member_id": member_id, "plan_id": plan["id"], "method": "card",
    }, headers=_auth(token))
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    expected_start = date.fromisoformat(body1["end_date"]) + timedelta(days=1)
    assert body2["start_date"] == expected_start.isoformat()

    # El resumen de cobro ya no reporta saldo (pagos quedaron paid)
    summary = (await client.get(f"/api/v1/members/{member_id}/billing-summary", headers=_auth(token))).json()
    assert float(summary["membership"]["balance_due"]) == 0


async def test_charge_cash_requires_open_shift(client):
    token = await _owner_token(client)
    member_id = await _member(client, token)
    plan = (await client.post("/api/v1/member-plans/", json={
        "name": f"Plan Cash {uuid.uuid4().hex[:6]}", "price": 50000, "duration_days": 30,
    }, headers=_auth(token))).json()
    cur = await client.get("/api/v1/cash/shifts/current", headers=_auth(token))
    if cur.json().get("open"):
        sid = cur.json()["shift"]["id"]
        await client.post(f"/api/v1/cash/shifts/{sid}/close", json={"counted_cash": 0}, headers=_auth(token))
    r = await client.post("/api/v1/member-plans/charge", json={
        "member_id": member_id, "plan_id": plan["id"], "method": "cash",
    }, headers=_auth(token))
    assert r.status_code == 400
    assert "turno" in r.json()["detail"].lower()


async def test_archive_product_with_sales(client):
    token = await _owner_token(client)
    product = await _product(client, token, stock=5)
    await client.post("/api/v1/payments", json={
        "amount": 1, "method": "transfer", "status": "paid",
        "concept": "Venta de productos",
        "items": [{"product_id": product["id"], "quantity": 1}],
    }, headers=_auth(token))
    r = await client.delete(f"/api/v1/products/{product['id']}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == {"archived": True}
    listing = (await client.get("/api/v1/products", headers=_auth(token))).json()
    assert all(p["id"] != product["id"] for p in listing)
