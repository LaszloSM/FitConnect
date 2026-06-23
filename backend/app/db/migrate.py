"""Migración del Master DB al arrancar (para RDS fresco en producción).

El pipeline no migra el RDS de prod (el `alembic upgrade head` de CI corre contra
la DB de tests), y los tenants nacen con `create_all`, pero el Master es
migration-driven. En un RDS vacío nadie crea su esquema → la app crashearía al
primer request. Aquí el backend lo aplica al arrancar, con un advisory lock
bloqueante para que con varias réplicas solo una migre y las demás esperen.

Reusa el `env.py` del Master (que abre su propio engine async vía `asyncio.run`);
por eso `command.upgrade` corre en un thread aparte: no se puede llamar
`asyncio.run` dentro del event loop ya corriendo del lifespan."""
import asyncio
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from app.db.master_session import master_engine

logger = logging.getLogger(__name__)

# Clave del advisory lock de migración (distinta de las de los jobs: 815001-815003).
_MIGRATION_LOCK_KEY = 815100
_BACKEND_ROOT = Path(__file__).resolve().parents[2]  # app/db/migrate.py -> backend/


def _run_upgrade_sync() -> None:
    cfg = Config(str(_BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_ROOT / "migrations" / "master"))
    command.upgrade(cfg, "head")


async def run_master_migrations() -> None:
    async with master_engine.connect() as conn:
        # Lock bloqueante: las demás réplicas esperan a que termine la que migra;
        # luego cada una corre el upgrade como no-op (ya en head). Nadie sirve
        # tráfico antes de que el esquema exista.
        await conn.execute(text("SELECT pg_advisory_lock(:key)"), {"key": _MIGRATION_LOCK_KEY})
        try:
            await asyncio.to_thread(_run_upgrade_sync)
            logger.info("Migraciones del Master aplicadas (head)")
        finally:
            await conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _MIGRATION_LOCK_KEY})
