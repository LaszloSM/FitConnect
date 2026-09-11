"""Máquinas: el módulo que se veía completo y no dejaba hacer casi nada.

El API tenía PUT y DELETE desde hacía meses y la pantalla no llamaba a ninguno.
El DELETE era borrado físico contra una FK sin cascada, así que borrar una
máquina con historial devolvía 500. Y "vencida" se calculaba dos veces, en
Python y en TypeScript, con reglas distintas.
"""
import uuid
from datetime import timedelta

import pytest

from app.core.timeutil import today_bogota

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="maquinas@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Maquinas", "gym_name": "Gym Maquinas", "city": "Medellín",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS[email] = r.json()["access_token"]
    return _TOKENS[email]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _machine(client, token, **extra):
    r = await client.post("/api/v1/machines", json={
        "name": f"Trotadora {uuid.uuid4().hex[:6]}", "area": "Cardio", **extra,
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


# ─────────────────────── Borrar sin romper nada ───────────────────────

async def test_deleting_a_machine_with_history_retires_it(client):
    """Ese historial es el argumento para reclamar la garantía: no se tira."""
    token = await _owner_token(client)
    m = await _machine(client, token)
    r = await client.post(f"/api/v1/machines/{m['id']}/maintenance", json={
        "description": "Cambio de banda", "technician": "Servicio técnico",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text

    borrado = await client.delete(f"/api/v1/machines/{m['id']}", headers=_auth(token))
    assert borrado.status_code == 200, borrado.text
    assert borrado.json()["archived"] is True

    quedo = await client.get(f"/api/v1/machines/{m['id']}", headers=_auth(token))
    assert quedo.status_code == 200
    assert quedo.json()["status"] == "retired"
    historial = await client.get(f"/api/v1/machines/{m['id']}/maintenance", headers=_auth(token))
    assert len(historial.json()) == 1, "se perdió el historial al retirar"


async def test_deleting_a_machine_without_history_removes_it(client):
    token = await _owner_token(client)
    m = await _machine(client, token)
    r = await client.delete(f"/api/v1/machines/{m['id']}", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["archived"] is False
    assert (await client.get(f"/api/v1/machines/{m['id']}", headers=_auth(token))).status_code == 404


# ─────────────────────── Una sola definición de "vencida" ───────────────────────

async def test_the_backend_says_whether_maintenance_is_due(client):
    """La regla vivía duplicada en jobs.py y en MachinesClient.tsx."""
    token = await _owner_token(client, email="maquinas-vencida@gym.com")
    hoy = today_bogota()

    vencida = await _machine(client, token, maintenance_interval_days=30,
                             last_maintenance_date=(hoy - timedelta(days=45)).isoformat())
    assert vencida["is_overdue"] is True
    assert vencida["days_until_maintenance"] == -15
    assert vencida["next_maintenance_date"] == (hoy - timedelta(days=15)).isoformat()

    pronto = await _machine(client, token, maintenance_interval_days=30,
                            last_maintenance_date=(hoy - timedelta(days=27)).isoformat())
    assert pronto["is_overdue"] is False
    assert pronto["is_due_soon"] is True, "el pre-aviso de 7 días no se marcó"

    tranquila = await _machine(client, token, maintenance_interval_days=30,
                               last_maintenance_date=hoy.isoformat())
    assert tranquila["is_overdue"] is False
    assert tranquila["is_due_soon"] is False


async def test_a_machine_without_interval_is_never_overdue(client):
    token = await _owner_token(client)
    m = await _machine(client, token)
    assert m["is_overdue"] is False
    assert m["next_maintenance_date"] is None


async def test_a_retired_machine_does_not_shout(client):
    """Se queda en la lista para consultar su historial, pero no alerta."""
    token = await _owner_token(client, email="maquinas-retirada@gym.com")
    hoy = today_bogota()
    m = await _machine(client, token, maintenance_interval_days=30,
                       last_maintenance_date=(hoy - timedelta(days=200)).isoformat(),
                       status="retired")
    assert m["is_overdue"] is False


# ─────────────────────── Listado que no miente ───────────────────────

async def test_the_list_reports_the_total_not_just_the_page(client):
    """Antes la pantalla se quedaba con los 50 primeros en silencio."""
    token = await _owner_token(client, email="maquinas-lista@gym.com")
    for _ in range(3):
        await _machine(client, token)

    r = await client.get("/api/v1/machines?limit=2", headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["items"]) == 2
    assert body["total"] >= 3, "el total no refleja lo que hay detrás de la página"


async def test_searching_by_brand_and_serial(client):
    token = await _owner_token(client, email="maquinas-busca@gym.com")
    marca = f"Tecnogym{uuid.uuid4().hex[:5]}"
    serial = f"SN-{uuid.uuid4().hex[:8]}"
    await _machine(client, token, brand=marca, serial_number=serial)
    await _machine(client, token, brand="Otra marca")

    por_marca = (await client.get(f"/api/v1/machines?q={marca}", headers=_auth(token))).json()
    assert por_marca["total"] == 1
    por_serial = (await client.get(f"/api/v1/machines?q={serial}", headers=_auth(token))).json()
    assert por_serial["total"] == 1


async def test_the_overdue_filter_and_counter(client):
    token = await _owner_token(client, email="maquinas-filtro@gym.com")
    hoy = today_bogota()
    vencida = await _machine(client, token, maintenance_interval_days=10,
                             last_maintenance_date=(hoy - timedelta(days=60)).isoformat())
    await _machine(client, token)

    r = (await client.get("/api/v1/machines?only_overdue=true", headers=_auth(token))).json()
    ids = {m["id"] for m in r["items"]}
    assert vencida["id"] in ids
    assert all(m["is_overdue"] for m in r["items"])
    assert r["overdue"] >= 1


# ─────────────────────── Preventivo y correctivo ───────────────────────

async def test_only_preventive_maintenance_resets_the_cycle(client):
    """Engrasar una banda rota no significa que el preventivo del mes ya se hizo."""
    token = await _owner_token(client, email="maquinas-ciclo@gym.com")
    hoy = today_bogota()
    m = await _machine(client, token, maintenance_interval_days=30,
                       last_maintenance_date=(hoy - timedelta(days=45)).isoformat())

    await client.post(f"/api/v1/machines/{m['id']}/maintenance", json={
        "description": "Se rompió el cable", "technician": "Juan", "kind": "correctivo",
    }, headers=_auth(token))
    tras_correctivo = (await client.get(f"/api/v1/machines/{m['id']}", headers=_auth(token))).json()
    assert tras_correctivo["is_overdue"] is True, "un correctivo reinició el ciclo preventivo"

    await client.post(f"/api/v1/machines/{m['id']}/maintenance", json={
        "description": "Engrase programado", "technician": "Juan", "kind": "preventivo",
    }, headers=_auth(token))
    tras_preventivo = (await client.get(f"/api/v1/machines/{m['id']}", headers=_auth(token))).json()
    assert tras_preventivo["is_overdue"] is False
    assert tras_preventivo["last_maintenance_date"] == hoy.isoformat()


async def test_the_log_records_who_reported_it(client):
    token = await _owner_token(client)
    m = await _machine(client, token)
    r = await client.post(f"/api/v1/machines/{m['id']}/maintenance", json={
        "description": "Ruido en el rodillo", "technician": "Pendiente",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["reported_by"], "no quedó quién lo registró"


# ─────────────────────── Reporte de avería ───────────────────────

async def test_reporting_a_fault_takes_the_machine_out_of_service(client):
    """El socio que la encontró rota deja de ser el único que lo sabe."""
    token = await _owner_token(client, email="maquinas-averia@gym.com")
    m = await _machine(client, token)

    r = await client.post(f"/api/v1/machines/{m['id']}/report-fault", json={
        "description": "La banda patina y se frena sola",
        "reported_by": "Pantalla del gym",
    }, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "correctivo"
    assert r.json()["reported_by"] == "Pantalla del gym"

    tras = (await client.get(f"/api/v1/machines/{m['id']}", headers=_auth(token))).json()
    assert tras["status"] == "damaged", "la máquina siguió ofreciéndose como buena"


async def test_reporting_a_fault_on_an_unknown_machine_is_404(client):
    token = await _owner_token(client)
    r = await client.post(f"/api/v1/machines/{uuid.uuid4()}/report-fault", json={
        "description": "No existe",
    }, headers=_auth(token))
    assert r.status_code == 404


# ─────────────────────── Editar desde la pantalla ───────────────────────

async def test_editing_a_machine_keeps_the_stored_photo_key(client):
    """El front devuelve la URL firmada que recibió; la key guardada manda."""
    token = await _owner_token(client, email="maquinas-foto@gym.com")
    m = await _machine(client, token)
    await client.put(f"/api/v1/machines/{m['id']}", json={
        "photo_url": "https://s3.amazonaws.com/firmada?X-Amz-Signature=abc",
        "brand": "Marca Nueva",
    }, headers=_auth(token))
    tras = (await client.get(f"/api/v1/machines/{m['id']}", headers=_auth(token))).json()
    assert tras["brand"] == "Marca Nueva"
    assert tras["photo_url"] is None, "se guardó una URL firmada que vence en 15 minutos"


@pytest.mark.parametrize("path", [
    "/api/v1/machines",
    "/api/v1/machines?only_overdue=true",
])
async def test_the_machines_screen_loads_on_an_empty_gym(client, path):
    token = await _owner_token(client, email="maquinas-vacio@gym.com")
    r = await client.get(path, headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["items"] == []
    assert r.json()["total"] == 0
