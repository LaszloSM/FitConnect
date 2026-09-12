"""Cierre ciego, arqueo por denominaciones, retiros a bóveda, corte X y
diferencias por cajero."""
import uuid
from urllib.parse import parse_qs, urlparse

from tests.helpers import create_member_without_membership

_TOKENS: dict[str, str] = {}


async def _owner_token(client):
    if "owner" in _TOKENS:
        return _TOKENS["owner"]
    email = "arqueo@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Arqueo", "gym_name": "Arqueo Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS["owner"] = r.json()["access_token"]
    return _TOKENS["owner"]


async def _receptionist(client, owner):
    """Un recepcionista NUEVO por llamada: sus agregados empiezan en cero."""
    email = f"cajero-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post("/api/v1/users/invite", json={
        "email": email, "full_name": f"Cajero {email[:14]}", "role": "receptionist",
    }, headers=_auth(owner))
    token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    acc = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": "StaffPass123!"})
    return acc.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _fresh_shift(client, token, opening=100000):
    cur = await client.get("/api/v1/cash/shifts/current", headers=_auth(token))
    if cur.json().get("open"):
        sid = cur.json()["shift"]["id"]
        await client.post(f"/api/v1/cash/shifts/{sid}/close", json={"counted_cash": 0}, headers=_auth(token))
    r = await client.post("/api/v1/cash/shifts/open", json={"opening_amount": opening}, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_cashier_does_not_see_expected_before_counting(client):
    owner = await _owner_token(client)
    cajero = await _receptionist(client, owner)
    sid = await _fresh_shift(client, owner, opening=50000)

    ciego = (await client.get("/api/v1/cash/shifts/current", headers=_auth(cajero))).json()
    assert ciego["blind"] is True
    assert ciego["expected_cash"] is None
    assert ciego["cash_income"] is None

    supervisor = (await client.get("/api/v1/cash/shifts/current", headers=_auth(owner))).json()
    assert supervisor["blind"] is False
    assert supervisor["expected_cash"] == "50000.00"

    # Al cerrar sí se revela: contar primero, saber después.
    closed = await client.post(f"/api/v1/cash/shifts/{sid}/close",
                               json={"denominations": {"50000": 1}}, headers=_auth(cajero))
    assert closed.status_code == 200, closed.text
    body = closed.json()
    assert float(body["expected_cash"]) == 50000.0
    assert float(body["difference"]) == 0.0
    assert body["denominations"] == {"50000": 1}


async def test_denominations_are_validated(client):
    owner = await _owner_token(client)
    sid = await _fresh_shift(client, owner)
    url = f"/api/v1/cash/shifts/{sid}/close"

    no_cuadra = await client.post(url, json={"counted_cash": 90000, "denominations": {"50000": 2}}, headers=_auth(owner))
    assert no_cuadra.status_code == 422
    invalida = await client.post(url, json={"denominations": {"30000": 1}}, headers=_auth(owner))
    assert invalida.status_code == 422
    vacio = await client.post(url, json={}, headers=_auth(owner))
    assert vacio.status_code == 422

    negativa = await client.post(url, json={"denominations": {"50000": -1}}, headers=_auth(owner))
    assert negativa.status_code == 422

    ok = await client.post(url, json={"denominations": {"50000": 1, "20000": 2, "10000": 1, "500": 0}},
                           headers=_auth(owner))
    assert ok.status_code == 200, ok.text
    assert float(ok.json()["counted_cash"]) == 100000.0
    assert ok.json()["denominations"] == {"50000": 1, "20000": 2, "10000": 1}


async def test_vault_drop_lowers_expected_and_shows_in_x_report(client):
    owner = await _owner_token(client)
    sid = await _fresh_shift(client, owner, opening=100000)
    member = await create_member_without_membership(client, _auth(owner), full_name="Pagador Arqueo")
    pay = await client.post("/api/v1/payments", json={
        "member_id": member["id"], "amount": 60000, "method": "cash", "status": "paid", "concept": "Plan",
    }, headers=_auth(owner))
    assert pay.status_code == 201, pay.text

    drop = await client.post(f"/api/v1/cash/shifts/{sid}/drops",
                             json={"amount": 80000, "note": "Bóveda mediodía"}, headers=_auth(owner))
    assert drop.status_code == 201, drop.text

    cur = (await client.get("/api/v1/cash/shifts/current", headers=_auth(owner))).json()
    assert cur["expected_cash"] == "80000.00"  # 100000 + 60000 - 80000
    assert cur["drops_total"] == "80000.00"
    assert [d["note"] for d in cur["drops"]] == ["Bóveda mediodía"]

    x = await client.get("/api/v1/cash/shifts/current/x-report", headers=_auth(owner))
    assert x.status_code == 200, x.text
    xb = x.json()
    assert xb["shift_id"] == sid
    assert xb["cash_income"] == "60000.00"
    assert xb["expected_cash"] == "80000.00"
    assert any(m["method"] == "cash" and m["count"] >= 1 for m in xb["by_method"])

    # Un retiro no es un gasto: la lista de egresos del turno no lo incluye.
    exp = await client.get("/api/v1/cash/expenses", params={"shift_id": sid}, headers=_auth(owner))
    assert all(e["concept"] != "Bóveda mediodía" for e in exp.json())

    closed = await client.post(f"/api/v1/cash/shifts/{sid}/close", json={"counted_cash": 80000}, headers=_auth(owner))
    assert float(closed.json()["difference"]) == 0.0
    tarde = await client.post(f"/api/v1/cash/shifts/{sid}/drops", json={"amount": 1000}, headers=_auth(owner))
    assert tarde.status_code == 400


async def test_x_report_and_differences_are_supervisor_only(client):
    owner = await _owner_token(client)
    cajero = await _receptionist(client, owner)
    await _fresh_shift(client, owner)
    assert (await client.get("/api/v1/cash/shifts/current/x-report", headers=_auth(cajero))).status_code == 403
    assert (await client.get("/api/v1/cash/differences", headers=_auth(cajero))).status_code == 403


async def test_differences_are_grouped_by_who_closed(client):
    owner = await _owner_token(client)
    cajero = await _receptionist(client, owner)
    sid = await _fresh_shift(client, owner, opening=40000)
    closed = await client.post(f"/api/v1/cash/shifts/{sid}/close", json={"counted_cash": 30000}, headers=_auth(cajero))
    assert closed.status_code == 200, closed.text
    staff_id = closed.json()["closed_by"]

    r = await client.get("/api/v1/cash/differences", headers=_auth(owner))
    assert r.status_code == 200, r.text
    fila = next(i for i in r.json()["items"] if i["staff_id"] == staff_id)
    assert fila["shifts"] == 1
    assert fila["with_difference"] == 1
    assert fila["shortage"] == "10000.00"
    assert fila["net"] == "-10000.00"


async def test_manual_refund_expense_is_rejected(client):
    """Un egreso manual de "devolución" no bajaba el esperado: el cuadre excluye
    esa categoría porque el ingreso ya viene neto."""
    owner = await _owner_token(client)
    await _fresh_shift(client, owner)
    r = await client.post("/api/v1/cash/expenses", json={
        "amount": 5000, "category": "devolucion", "concept": "Devolución a mano", "method": "cash",
    }, headers=_auth(owner))
    assert r.status_code == 400


async def test_reopen_clears_the_count(client):
    owner = await _owner_token(client)
    sid = await _fresh_shift(client, owner, opening=20000)
    await client.post(f"/api/v1/cash/shifts/{sid}/close", json={"denominations": {"10000": 2}}, headers=_auth(owner))
    r = await client.post(f"/api/v1/cash/shifts/{sid}/reopen",
                          json={"reason": "Conté mal los billetes"}, headers=_auth(owner))
    assert r.status_code == 200, r.text
    assert r.json()["denominations"] is None
    assert r.json()["counted_cash"] is None
