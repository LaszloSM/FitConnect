"""Un gym recién creado no puede reventar en ninguna pantalla.

Este es el caso que rompió en producción: un gimnasio sin socios, sin pagos y sin
inventario. Recorre todos los GET del API que no necesitan un id y falla si
alguno responde 5xx. Es barato de mantener: al agregar un router nuevo entra solo.
"""
import uuid

import pytest

from app.main import app

# Rutas que no se pueden probar a ciegas: piden contexto propio (token de
# dispositivo), efectos externos, o son de administración.
SKIP_PREFIXES = ("/api/v1/kiosk/", "/api/v1/access/", "/api/v1/admin/", "/api/v1/public/", "/api/v1/realtime/")
SKIP_EXACT = {"/api/v1/auth/refresh"}


def _get_routes() -> list[str]:
    out = []
    for r in app.routes:
        path = getattr(r, "path", "")
        methods = getattr(r, "methods", set()) or set()
        if "GET" not in methods or not path.startswith("/api/v1/"):
            continue
        if "{" in path or path in SKIP_EXACT or path.startswith(SKIP_PREFIXES):
            continue
        out.append(path)
    return sorted(set(out))


@pytest.fixture(scope="module")
def routes():
    return _get_routes()


async def test_every_listing_endpoint_survives_an_empty_gym(client, routes):
    email = f"vacio-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "SecurePass123!", "full_name": "Owner Vacío",
        "gym_name": "Gym Vacío", "city": "Bogotá",
    })
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "SecurePass123!"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert routes, "no se detectó ninguna ruta GET; ¿cambió el router?"
    fallos = []
    for path in routes:
        r = await client.get(path, headers=headers)
        if r.status_code >= 500:
            fallos.append(f"{path} -> {r.status_code} {r.text[:160]}")

    assert not fallos, "Endpoints que revientan con un gym vacío:\n" + "\n".join(fallos)


async def test_every_report_export_works_on_an_empty_gym(client):
    """Los PDF y Excel también: un gym sin datos debe generar el archivo vacío,
    no un 500. Aquí salió que la pestaña Inteligencia no tenía export."""
    email = f"exp-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "SecurePass123!", "full_name": "Owner Export",
        "gym_name": "Gym Export", "city": "Bogotá",
    })
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "SecurePass123!"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    tabs = ["ingresos", "ventas", "pases", "socios", "asistencia", "retencion", "inteligencia", "cierre"]
    for tab in tabs:
        for fmt, magic in (("pdf", b"%PDF"), ("xlsx", b"PK")):
            r = await client.get(f"/api/v1/reports/{tab}/export.{fmt}", headers=headers)
            assert r.status_code == 200, f"{tab}.{fmt} -> {r.status_code} {r.text[:160]}"
            assert r.content.startswith(magic), f"{tab}.{fmt} no es un {fmt} válido"
