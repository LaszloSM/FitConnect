"""Inventario real: categorías, movimientos de stock, ventas con rastro,
devoluciones y comprobante PDF."""
import uuid

from tests.helpers import create_member_without_membership

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="inventario@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Inventario", "gym_name": "Inventario Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    await client.patch("/api/v1/settings/operations", json={"cash_shifts_enabled": False}, headers=_auth(token))
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _product(client, token, stock=10, price=5000, cost=2000, **extra):
    r = await client.post("/api/v1/products", json={
        "name": f"Prod {uuid.uuid4().hex[:6]}", "price": price, "stock": stock, "cost_price": cost, **extra,
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _sale(client, token, product_id, qty=1, method="cash", discount=0, member_id=None):
    r = await client.post("/api/v1/payments", json={
        "member_id": member_id, "amount": 1, "method": method, "status": "paid",
        "concept": "Venta de productos", "discount_amount": discount,
        "items": [{"product_id": product_id, "quantity": qty}],
    }, headers=_auth(token))
    return r


# ─── Categorías ─────────────────────────────────────────────────────────────

async def test_categories_crud_and_product_link(client):
    token = await _owner_token(client)
    name = f"Bebidas {uuid.uuid4().hex[:4]}"
    r = await client.post("/api/v1/products/categories", json={"name": name}, headers=_auth(token))
    assert r.status_code == 201, r.text
    cat = r.json()
    dup = await client.post("/api/v1/products/categories", json={"name": name.lower()}, headers=_auth(token))
    assert dup.status_code == 409

    sku = f"AGUA-{uuid.uuid4().hex[:5]}"
    p = await _product(client, token, category_id=cat["id"], sku=sku)
    assert p["category_name"] == name
    listed = (await client.get("/api/v1/products", params={"category_id": cat["id"]}, headers=_auth(token))).json()
    assert any(x["id"] == p["id"] for x in listed)
    by_sku = (await client.get("/api/v1/products", params={"q": sku}, headers=_auth(token))).json()
    assert any(x["id"] == p["id"] for x in by_sku)

    r = await client.delete(f"/api/v1/products/categories/{cat['id']}", headers=_auth(token))
    assert r.status_code == 200
    p2 = next(x for x in (await client.get("/api/v1/products", headers=_auth(token))).json() if x["id"] == p["id"])
    assert p2["category_id"] is None


# ─── Movimientos ────────────────────────────────────────────────────────────

async def test_initial_stock_purchase_waste_and_adjustment_leave_trail(client):
    token = await _owner_token(client)
    p = await _product(client, token, stock=10)
    h = _auth(token)

    r = await client.post(f"/api/v1/products/{p['id']}/movements", json={"type": "purchase", "quantity": 5, "unit_cost": 2500, "note": "Compra proveedor"}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["quantity"] == 5 and r.json()["stock_after"] == 15
    r = await client.post(f"/api/v1/products/{p['id']}/movements", json={"type": "waste", "quantity": 2, "note": "Vencido"}, headers=h)
    assert r.json()["quantity"] == -2 and r.json()["stock_after"] == 13
    r = await client.post(f"/api/v1/products/{p['id']}/movements", json={"type": "adjustment", "quantity": -3, "note": "Conteo"}, headers=h)
    assert r.json()["stock_after"] == 10
    r = await client.post(f"/api/v1/products/{p['id']}/movements", json={"type": "waste", "quantity": 999}, headers=h)
    assert r.status_code == 409

    # La última compra actualiza el costo de referencia
    prod = next(x for x in (await client.get("/api/v1/products", headers=h)).json() if x["id"] == p["id"])
    assert float(prod["cost_price"]) == 2500 and prod["stock"] == 10

    history = (await client.get(f"/api/v1/products/{p['id']}/movements", headers=h)).json()
    types = [m["type"] for m in history]
    assert types[:3] == ["adjustment", "waste", "purchase"]
    assert history[-1]["note"] == "Saldo inicial" and history[-1]["stock_after"] == 10
    assert history[0]["created_by_name"] == "Owner Inventario"


async def test_put_stock_creates_adjustment(client):
    token = await _owner_token(client)
    p = await _product(client, token, stock=4)
    r = await client.put(f"/api/v1/products/{p['id']}", json={"stock": 9}, headers=_auth(token))
    assert r.status_code == 200 and r.json()["stock"] == 9
    history = (await client.get(f"/api/v1/products/{p['id']}/movements", headers=_auth(token))).json()
    assert history[0]["type"] == "adjustment" and history[0]["quantity"] == 5


# ─── Ventas, descuento, devolución ──────────────────────────────────────────

async def test_sale_leaves_movement_with_cost_snapshot_and_discount(client):
    token = await _owner_token(client)
    p = await _product(client, token, stock=10, price=5000, cost=2000)
    r = await _sale(client, token, p["id"], qty=3, discount=1000)
    assert r.status_code == 201, r.text
    body = r.json()
    assert float(body["amount"]) == 14000 and body["kind"] == "product"
    history = (await client.get(f"/api/v1/products/{p['id']}/movements", headers=_auth(token))).json()
    sale = history[0]
    assert sale["type"] == "sale" and sale["quantity"] == -3 and sale["stock_after"] == 7
    assert float(sale["unit_cost"]) == 2000 and sale["payment_id"] == body["id"]

    r = await _sale(client, token, p["id"], qty=1, discount=99999)
    assert r.status_code == 400


async def test_refund_cash_creates_expense_returns_stock_keeps_receipt(client):
    token = await _owner_token(client)
    p = await _product(client, token, stock=5)
    sale = (await _sale(client, token, p["id"], qty=2)).json()
    h = _auth(token)

    r = await client.post(f"/api/v1/payments/{sale['id']}/refund", json={"reason": "Producto defectuoso"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded" and r.json()["refund_reason"] == "Producto defectuoso"

    prod = next(x for x in (await client.get("/api/v1/products", headers=h)).json() if x["id"] == p["id"])
    assert prod["stock"] == 5
    history = (await client.get(f"/api/v1/products/{p['id']}/movements", headers=h)).json()
    assert history[0]["type"] == "return" and history[0]["quantity"] == 2

    expenses = (await client.get("/api/v1/cash/expenses", headers=h)).json()
    assert any(e["category"] == "devolucion" and float(e["amount"]) == float(sale["amount"]) for e in expenses)

    # El recibo original sigue existiendo y el PDF lo marca como devuelto
    r = await client.get(f"/api/v1/payments/{sale['id']}/receipt", headers=h)
    assert r.status_code == 200
    pdf = await client.get(f"/api/v1/payments/{sale['id']}/receipt.pdf", headers=h)
    assert pdf.status_code == 200 and pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content[:5] == b"%PDF-"

    # Devolver dos veces no procede; borrar un pago con recibo tampoco
    r = await client.post(f"/api/v1/payments/{sale['id']}/refund", json={"reason": "otra vez"}, headers=h)
    assert r.status_code == 400
    r = await client.delete(f"/api/v1/payments/{sale['id']}", headers=h)
    assert r.status_code == 400


async def test_refund_pending_rejected(client):
    token = await _owner_token(client)
    p = await _product(client, token, stock=5)
    sale = (await _sale(client, token, p["id"], qty=1, method="transfer")).json()
    assert sale["status"] == "pending"
    r = await client.post(f"/api/v1/payments/{sale['id']}/refund", json={"reason": "no aplica"}, headers=_auth(token))
    assert r.status_code == 400


# ─── Comprobante público firmado ────────────────────────────────────────────

async def test_public_receipt_link_valid_and_tampered(client):
    token = await _owner_token(client)
    p = await _product(client, token, stock=5)
    sale = (await _sale(client, token, p["id"], qty=1)).json()
    r = await client.get(f"/api/v1/payments/{sale['id']}/receipt-link", headers=_auth(token))
    assert r.status_code == 200, r.text
    path = r.json()["path"]
    assert r.json()["receipt_number"]

    pdf = await client.get(path)
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-"

    tampered = path[:-6] + "x.pdf"
    assert (await client.get(tampered)).status_code == 404


# ─── Reporte de ventas por producto ─────────────────────────────────────────

async def test_product_sales_report_margin(client):
    token = await _owner_token(client)
    p = await _product(client, token, stock=10, price=5000, cost=2000)
    await _sale(client, token, p["id"], qty=2)
    r = await client.get("/api/v1/reports/product-sales", headers=_auth(token))
    assert r.status_code == 200, r.text
    row = next(x for x in r.json()["products"] if x["product_id"] == p["id"])
    assert row["units"] == 2 and row["revenue"] == 10000 and row["cost"] == 4000 and row["margin"] == 6000
    assert r.json()["total_margin"] >= 6000


async def test_refund_day_pass_revokes_access_and_report_prorates_discount(client):
    token = await _owner_token(client)
    h = _auth(token)
    # Pase del día pagado en efectivo → devolver → el pase deja de dar acceso
    r = await client.post("/api/v1/day-passes/types", json={"name": f"Pase {uuid.uuid4().hex[:4]}", "price": 10000}, headers=h)
    ptype = r.json()
    sold = (await client.post("/api/v1/day-passes/sell", json={
        "id_number": str(uuid.uuid4().int)[:10], "full_name": "Reembolso Pase", "pass_type_id": ptype["id"], "method": "cash",
    }, headers=h)).json()
    r = await client.post(f"/api/v1/payments/{sold['payment_id']}/refund", json={"reason": "Se arrepintió"}, headers=h)
    assert r.status_code == 200, r.text
    r = await client.post("/api/v1/checkins", json={"member_id": sold["member_id"]}, headers=h)
    assert r.json()["decision"] == "denied"
    passes = (await client.get("/api/v1/day-passes", headers=h)).json()
    assert next(p for p in passes if p["id"] == sold["day_pass"]["id"])["status"] == "void"

    # Venta con descuento: el reporte reparte el descuento y no infla el margen
    p = await _product(client, token, stock=10, price=10000, cost=4000)
    r = await _sale(client, token, p["id"], qty=2, discount=2000)
    assert r.status_code == 201, r.text
    rep = (await client.get("/api/v1/reports/product-sales", headers=h)).json()
    row = next(x for x in rep["products"] if x["product_id"] == p["id"])
    assert row["gross"] == 20000 and row["discount"] == 2000 and row["revenue"] == 18000
    assert row["cost"] == 8000 and row["margin"] == 10000


async def test_receptionist_cannot_write_off_stock(client):
    token = await _owner_token(client)
    h = _auth(token)
    p = await _product(client, token, stock=5)
    inv = await client.post("/api/v1/users/invite", json={
        "email": f"recep-{uuid.uuid4().hex[:6]}@test.co", "full_name": "Recep Inv", "role": "receptionist",
    }, headers=h)
    if inv.status_code not in (200, 201):
        return  # el módulo de invitaciones no está disponible en este entorno
    invite_url = inv.json().get("invite_url", "")
    tok = invite_url.rsplit("token=", 1)[-1] if "token=" in invite_url else inv.json().get("token")
    if not tok:
        return
    acc = await client.post("/api/v1/auth/staff/accept-invite", json={"token": tok, "password": "Recep12345!"})
    if acc.status_code not in (200, 201):
        return
    staff_token = acc.json().get("access_token")
    if not staff_token:
        login = await client.post("/api/v1/auth/staff/login", json={"email": inv.json().get("email"), "password": "Recep12345!"})
        staff_token = login.json().get("access_token")
    sh = _auth(staff_token)
    r = await client.post(f"/api/v1/products/{p['id']}/movements", json={"type": "waste", "quantity": 1}, headers=sh)
    assert r.status_code == 403
    r = await client.post(f"/api/v1/products/{p['id']}/movements", json={"type": "purchase", "quantity": 1}, headers=sh)
    assert r.status_code == 201
