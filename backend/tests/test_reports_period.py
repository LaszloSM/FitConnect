"""Reportes por período, exports por pestaña y señales de BI."""
import uuid

from app.core.timeutil import today_bogota
from tests.helpers import create_member

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="reportes@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Reportes", "gym_name": "Reportes Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    await client.patch("/api/v1/settings/operations", json={"cash_shifts_enabled": False}, headers=_auth(token))
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _seed(client, token):
    h = _auth(token)
    member = await create_member(client, h, full_name="Socio Reportes")
    r = await client.post("/api/v1/products", json={"name": f"Bebida {uuid.uuid4().hex[:5]}", "price": 4000, "stock": 10, "cost_price": 1500}, headers=h)
    product = r.json()
    await client.post("/api/v1/payments", json={
        "member_id": member["id"], "amount": 1, "method": "cash", "status": "paid",
        "concept": "Venta de productos", "items": [{"product_id": product["id"], "quantity": 2}],
    }, headers=h)
    await client.post("/api/v1/checkins", json={"member_id": member["id"]}, headers=h)
    return member, product


async def test_summary_breakdown_attendance_period(client):
    token = await _owner_token(client)
    h = _auth(token)
    member, _ = await _seed(client, token)
    today = today_bogota().isoformat()

    s = (await client.get("/api/v1/reports/summary", params={"from": today, "to": today}, headers=h)).json()
    assert s["revenue"] >= 8000 and s["checkins"] >= 1 and s["days"] == 1

    b = (await client.get("/api/v1/reports/revenue-breakdown", params={"from": today, "to": today}, headers=h)).json()
    assert any(k["kind"] == "product" for k in b["by_kind"])
    assert any(m["method"] == "cash" for m in b["by_method"])

    d = (await client.get("/api/v1/reports/revenue-daily", params={"from": today, "to": today}, headers=h)).json()
    assert d[0]["date"] == today and d[0]["product"] >= 8000

    a = (await client.get("/api/v1/reports/attendance", params={"from": today, "to": today}, headers=h)).json()
    assert a["total"] >= 1 and a["peak"]["busiest_hour"] is not None and len(a["peak"]["cells"]) == 168

    o = (await client.get("/api/v1/reports/members-overview", params={"from": today, "to": today}, headers=h)).json()
    assert o["new_in_period"] >= 1 and o["by_membership_status"]["active"] >= 1


async def test_exports_per_tab_and_month_close(client):
    token = await _owner_token(client)
    h = _auth(token)
    await _seed(client, token)
    today = today_bogota().isoformat()
    for tab in ("ingresos", "ventas", "pases", "socios", "asistencia", "retencion"):
        pdf = await client.get(f"/api/v1/reports/{tab}/export.pdf", params={"from": today, "to": today}, headers=h)
        assert pdf.status_code == 200, (tab, pdf.text)
        assert pdf.content[:5] == b"%PDF-"
        xlsx = await client.get(f"/api/v1/reports/{tab}/export.xlsx", params={"from": today, "to": today}, headers=h)
        assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK", tab
    close = await client.get("/api/v1/reports/cierre/export.pdf", params={"from": today}, headers=h)
    assert close.status_code == 200 and close.content[:5] == b"%PDF-"
    bad = await client.get("/api/v1/reports/noexiste/export.pdf", headers=h)
    assert bad.status_code == 404


async def test_insights_endpoints(client):
    token = await _owner_token(client)
    h = _auth(token)
    await _seed(client, token)
    fc = (await client.get("/api/v1/insights/forecast", headers=h)).json()
    assert fc["month_to_date"] >= 8000 and fc["projection"] >= fc["month_to_date"]
    peak = (await client.get("/api/v1/insights/peak-hours", headers=h)).json()
    assert peak["total"] >= 1
    risk = (await client.get("/api/v1/insights/churn-risk", headers=h)).json()
    assert isinstance(risk, list)
    stock = (await client.get("/api/v1/insights/stockout", headers=h)).json()
    assert any(p["units_sold_30d"] >= 2 and p["days_left"] is not None for p in stock)
    coh = (await client.get("/api/v1/insights/cohorts", headers=h)).json()
    assert len(coh) == 6 and coh[-1]["size"] >= 1

    # Recepción no ve inteligencia de negocio
    ins = (await client.get("/api/v1/dashboard/insights", headers=h)).json()
    assert "insights" in ins
