import asyncio
import uuid
from datetime import date

from tests.helpers import create_member_without_membership

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="cash@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Cash", "gym_name": "Cash Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _member(client, token):
    member = await create_member_without_membership(client, _auth(token), full_name="Pagador")
    return member["id"]


async def _ensure_no_open_shift(client, token):
    cur = await client.get("/api/v1/cash/shifts/current", headers=_auth(token))
    if cur.json().get("open"):
        sid = cur.json()["shift"]["id"]
        await client.post(f"/api/v1/cash/shifts/{sid}/close", json={"counted_cash": 0}, headers=_auth(token))


async def test_cash_payment_requires_open_shift(client):
    token = await _owner_token(client, email="cashreq@gym.com")
    await _ensure_no_open_shift(client, token)
    member_id = await _member(client, token)
    r = await client.post("/api/v1/payments", json={
        "member_id": member_id, "amount": 50000, "method": "cash",
        "status": "paid", "concept": "Mensualidad",
    }, headers=_auth(token))
    assert r.status_code == 400, r.text


async def test_open_shift_single_per_location(client):
    token = await _owner_token(client, email="cashsingle@gym.com")
    await _ensure_no_open_shift(client, token)
    r1 = await client.post("/api/v1/cash/shifts/open", json={"opening_amount": 100000}, headers=_auth(token))
    assert r1.status_code == 201, r1.text
    r2 = await client.post("/api/v1/cash/shifts/open", json={"opening_amount": 50000}, headers=_auth(token))
    assert r2.status_code == 400


async def test_shift_close_reconciles_income_and_expenses(client):
    token = await _owner_token(client, email="cashclose@gym.com")
    # Cerrar cualquier turno residual abierto
    cur = await client.get("/api/v1/cash/shifts/current", headers=_auth(token))
    if cur.json().get("open"):
        sid = cur.json()["shift"]["id"]
        await client.post(f"/api/v1/cash/shifts/{sid}/close", json={"counted_cash": 0}, headers=_auth(token))

    opened = await client.post("/api/v1/cash/shifts/open", json={"opening_amount": 100000}, headers=_auth(token))
    shift_id = opened.json()["id"]
    member_id = await _member(client, token)
    # Ingreso cash 60000
    await client.post("/api/v1/payments", json={
        "member_id": member_id, "amount": 60000, "method": "cash", "status": "paid", "concept": "Plan",
    }, headers=_auth(token))
    # Egreso cash 20000
    await client.post("/api/v1/cash/expenses", json={
        "amount": 20000, "category": "insumos", "concept": "Toallas", "method": "cash",
    }, headers=_auth(token))

    cur = await client.get("/api/v1/cash/shifts/current", headers=_auth(token))
    assert cur.json()["expected_cash"] == "140000.00"  # 100000 + 60000 - 20000

    # Cierre con conteo exacto → diferencia 0
    closed = await client.post(f"/api/v1/cash/shifts/{shift_id}/close",
                               json={"counted_cash": 140000}, headers=_auth(token))
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert body["status"] == "closed"
    assert float(body["expected_cash"]) == 140000.0
    assert float(body["difference"]) == 0.0


async def test_paid_payment_generates_receipt(client):
    token = await _owner_token(client, email="cashreceipt@gym.com")
    cur = await client.get("/api/v1/cash/shifts/current", headers=_auth(token))
    if not cur.json().get("open"):
        await client.post("/api/v1/cash/shifts/open", json={"opening_amount": 0}, headers=_auth(token))
    member_id = await _member(client, token)
    pay = await client.post("/api/v1/payments", json={
        "member_id": member_id, "amount": 50000, "method": "cash", "status": "paid", "concept": "Mensualidad",
    }, headers=_auth(token))
    payment_id = pay.json()["id"]
    r = await client.get(f"/api/v1/payments/{payment_id}/receipt", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["number"].startswith("FC-")
    assert float(r.json()["amount"]) == 50000.0


async def test_receipt_numbers_unique_under_concurrency(client):
    token = await _owner_token(client, email="cashconc@gym.com")
    cur = await client.get("/api/v1/cash/shifts/current", headers=_auth(token))
    if not cur.json().get("open"):
        await client.post("/api/v1/cash/shifts/open", json={"opening_amount": 0}, headers=_auth(token))

    member_ids = [await _member(client, token) for _ in range(6)]

    async def pay(mid):
        # card queda paid de inmediato (transfer ahora entra pending sin recibo)
        return await client.post("/api/v1/payments", json={
            "member_id": mid, "amount": 10000, "method": "card", "status": "paid", "concept": "Concurrente",
        }, headers=_auth(token))

    results = await asyncio.gather(*[pay(m) for m in member_ids])
    payment_ids = [r.json()["id"] for r in results]
    numbers = []
    for pid in payment_ids:
        rec = await client.get(f"/api/v1/payments/{pid}/receipt", headers=_auth(token))
        numbers.append(rec.json()["number"])
    assert len(set(numbers)) == len(numbers)  # todos únicos
