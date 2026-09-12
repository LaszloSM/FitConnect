"""Mantenimiento como negocio: costos, garantía, calendario, QR y áreas estables."""
import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

from app.core.timeutil import today_bogota

_TOKENS: dict[str, str] = {}


async def _owner_token(client):
    if "owner" in _TOKENS:
        return _TOKENS["owner"]
    email = "maquinas-negocio@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Negocio", "gym_name": "Gym Negocio", "city": "Cali",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS["owner"] = r.json()["access_token"]
    return _TOKENS["owner"]


async def _receptionist(client, owner):
    if "recep" in _TOKENS:
        return _TOKENS["recep"]
    email = f"recep-maq-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post("/api/v1/users/invite", json={
        "email": email, "full_name": "Recepción Máquinas", "role": "receptionist",
    }, headers=_auth(owner))
    token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    acc = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": "StaffPass123!"})
    _TOKENS["recep"] = acc.json()["access_token"]
    return _TOKENS["recep"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _machine(client, token, **extra):
    r = await client.post("/api/v1/machines", json={
        "name": f"Elíptica {uuid.uuid4().hex[:6]}", "area": "cardio", **extra,
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def test_area_is_stored_as_a_stable_slug(client):
    owner = await _owner_token(client)
    vieja = await _machine(client, owner, area="Peso libre")
    assert vieja["area"] == "peso_libre"

    invalida = await client.post("/api/v1/machines", json={"name": "X", "area": "Piscina"}, headers=_auth(owner))
    assert invalida.status_code == 422

    # El filtro acepta la etiqueta vieja y el slug.
    for valor in ("peso_libre", "Peso libre"):
        r = await client.get("/api/v1/machines", params={"area": valor, "q": vieja["name"]}, headers=_auth(owner))
        assert [m["id"] for m in r.json()["items"]] == [vieja["id"]]


async def test_warranty_and_supplier_round_trip(client):
    owner = await _owner_token(client)
    hoy = today_bogota()
    m = await _machine(client, owner, supplier="Importadora Andina",
                       purchase_date=(hoy - timedelta(days=200)).isoformat(),
                       warranty_until=(hoy + timedelta(days=165)).isoformat())
    assert m["supplier"] == "Importadora Andina"
    assert m["warranty_active"] is True

    r = await client.put(f"/api/v1/machines/{m['id']}",
                         json={"warranty_until": (hoy - timedelta(days=1)).isoformat()}, headers=_auth(owner))
    assert r.status_code == 200, r.text
    assert r.json()["warranty_active"] is False


async def test_maintenance_costs_are_visible_to_who_manages_machines(client):
    owner = await _owner_token(client)
    recep = await _receptionist(client, owner)
    m = await _machine(client, owner)
    for kind, cost in (("preventivo", 80000), ("correctivo", 250000)):
        r = await client.post(f"/api/v1/machines/{m['id']}/maintenance", json={
            "description": f"Trabajo {kind}", "technician": "Técnico", "cost": cost, "kind": kind,
        }, headers=_auth(owner))
        assert r.status_code == 201, r.text

    costos = await client.get("/api/v1/machines/costs", headers=_auth(owner))
    assert costos.status_code == 200, costos.text
    fila = next(x for x in costos.json()["by_machine"] if x["id"] == m["id"])
    assert float(fila["amount"]) == 330000.0
    assert float(fila["corrective"]) == 250000.0
    assert fila["count"] == 2

    lista = await client.get("/api/v1/machines", params={"q": m["name"]}, headers=_auth(owner))
    assert float(lista.json()["items"][0]["maintenance_cost_total"]) == 330000.0

    # Recepción consulta máquinas, pero la plata del mantenimiento no le llega.
    assert (await client.get("/api/v1/machines/costs", headers=_auth(recep))).status_code == 403
    lista_r = await client.get("/api/v1/machines", params={"q": m["name"]}, headers=_auth(recep))
    assert "maintenance_cost_total" not in lista_r.json()["items"][0]


async def test_calendar_lists_what_is_due_and_skips_retired(client):
    owner = await _owner_token(client)
    hoy = today_bogota()
    pronto = await _machine(client, owner, maintenance_interval_days=30,
                            last_maintenance_date=(hoy - timedelta(days=27)).isoformat())
    lejos = await _machine(client, owner, maintenance_interval_days=365,
                           last_maintenance_date=hoy.isoformat())
    retirada = await _machine(client, owner, maintenance_interval_days=30, status="retired",
                              last_maintenance_date=(hoy - timedelta(days=40)).isoformat())

    r = await client.get("/api/v1/machines/calendar", params={"days": 30}, headers=_auth(owner))
    assert r.status_code == 200, r.text
    ids = {i["id"]: i for i in r.json()["items"]}
    assert ids[pronto["id"]]["days_until_maintenance"] == 3
    assert lejos["id"] not in ids
    assert retirada["id"] not in ids


async def test_qr_report_link_lets_anyone_report_a_fault(client):
    owner = await _owner_token(client)
    m = await _machine(client, owner)

    link = await client.post(f"/api/v1/machines/{m['id']}/report-link", headers=_auth(owner))
    assert link.status_code == 200, link.text
    path = link.json()["path"]
    _, _, slug, token = path.split("/")

    # Mismo token al volver a pedirlo: la calcomanía pegada sigue sirviendo.
    again = await client.post(f"/api/v1/machines/{m['id']}/report-link", headers=_auth(owner))
    assert again.json()["token"] == token

    info = await client.get(f"/api/v1/public/machines/{slug}/{token}")
    assert info.status_code == 200, info.text
    assert info.json()["machine_name"] == m["name"]

    rep = await client.post(f"/api/v1/public/machines/{slug}/{token}/fault",
                            json={"description": "Hace un ruido metálico", "reporter_name": "Laura"})
    assert rep.status_code == 201, rep.text

    maquina = await client.get(f"/api/v1/machines/{m['id']}", headers=_auth(owner))
    assert maquina.json()["status"] == "damaged"
    logs = await client.get(f"/api/v1/machines/{m['id']}/maintenance", headers=_auth(owner))
    assert logs.json()[0]["reported_by"] == "Laura (QR)"

    # Otro gym no abre este QR, y rotar invalida el anterior.
    assert (await client.get(f"/api/v1/public/machines/otro-gym-{uuid.uuid4().hex[:4]}/{token}")).status_code == 404
    rotado = await client.post(f"/api/v1/machines/{m['id']}/report-link", params={"rotate": True}, headers=_auth(owner))
    assert rotado.json()["token"] != token
    assert (await client.get(f"/api/v1/public/machines/{slug}/{token}")).status_code == 404
