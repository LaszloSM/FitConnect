import logging
import re
from logging.config import fileConfig
from pathlib import Path

from httpx import ASGITransport, AsyncClient

from app.core.logging import mask_pii, setup_logging
from app.main import app

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def test_mask_pii_hides_bearer_and_numbers():
    masked = mask_pii("Authorization: Bearer abc.def-123 cedula 1098765432")
    assert "abc.def-123" not in masked
    assert "1098765432" not in masked
    assert "Bearer ***" in masked


async def test_health_reports_dependencies(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "dependencies" in body
    assert "database" in body["dependencies"]
    assert body["dependencies"]["database"] == "ok"


async def test_request_id_header_present(client):
    r = await client.get("/health")
    assert r.headers.get("x-request-id")


def test_alembic_file_config_does_not_silence_the_app():
    """El arranque corre `alembic upgrade head` en proceso (app/db/migrate.py).

    El env.py de alembic llama a fileConfig, y su default disable_existing_loggers
    apaga TODOS los loggers ya configurados. Cuando eso pasó en producción, el
    backend sirvió tráfico dos días sin escribir una sola línea: ni accesos, ni los
    500 de 13 endpoints caídos. Este test fija el contrato."""
    # 1) Ningún env.py puede llamar a fileConfig con el default.
    # La comprobación mira la LLAMADA, no el texto suelto: un comentario que
    # mencione el flag no debe dar por bueno un env.py que no lo pasa.
    llamada_segura = re.compile(
        r"fileConfig\([^)]*disable_existing_loggers\s*=\s*False[^)]*\)", re.S
    )
    culpables = []
    for env in BACKEND_ROOT.glob("migrations/**/env.py"):
        src = env.read_text(encoding="utf-8")
        llamadas = re.findall(r"^\s*fileConfig\([^)]*\)", src, re.M | re.S)
        if llamadas and not all(llamada_segura.fullmatch(c.strip()) for c in llamadas):
            culpables.append(env.relative_to(BACKEND_ROOT).as_posix())
    assert not culpables, (
        "estos env.py llaman a fileConfig sin disable_existing_loggers=False y "
        "dejarán mudo al backend al arrancar: " + ", ".join(culpables)
    )

    # 2) Y con ese flag, los loggers sobreviven de verdad.
    vigilados = ("uvicorn.access", "uvicorn.error", "app.services.payments")
    setup_logging("INFO")
    for name in vigilados:
        logging.getLogger(name).disabled = False

    fileConfig(str(BACKEND_ROOT / "alembic.ini"), disable_existing_loggers=False)

    silenciados = [n for n in vigilados if logging.getLogger(n).disabled]
    assert not silenciados, "fileConfig dejó mudos: " + ", ".join(silenciados)


async def test_unhandled_exception_is_logged(caplog):
    """Un 500 no controlado tiene que dejar traza con su traceback."""
    @app.get("/_test_boom")
    async def _boom():
        raise RuntimeError("explosión de prueba")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    with caplog.at_level(logging.ERROR):
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/_test_boom")

    assert r.status_code == 500
    assert any(
        rec.levelno >= logging.ERROR and rec.exc_info for rec in caplog.records
    ), "el 500 no dejó ninguna línea de log con traceback"

    app.router.routes = [
        route for route in app.router.routes if getattr(route, "path", "") != "/_test_boom"
    ]
