"""Aplica las migraciones tenant a TODAS las tenant DBs registradas en Master.

Uso (dentro del contenedor backend):
    python migrate_tenants.py

Las DBs creadas con create_all (sin alembic_version) se stampean en la
revisión previa conocida y luego se migran a head.
"""
import asyncio

from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.master_session import MasterSessionLocal
from app.models.master.tenant import Tenant

# Última revisión cuyo esquema coincide con un create_all previo a F1
PRE_F1_HEAD = "c4d5e6f7a8b9"


async def migrate_all() -> None:
    async with MasterSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()

    ok, failed = 0, 0
    for tenant in tenants:
        url = settings.tenant_database_url_template.replace("{db_name}", tenant.db_name)
        engine = create_async_engine(url)
        try:
            async with engine.connect() as conn:
                has_version = (await conn.execute(text(
                    "SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version'"
                ))).scalar()
        except Exception as e:
            print(f"SKIP {tenant.db_name}: {type(e).__name__}: {e}")
            failed += 1
            await engine.dispose()
            continue
        await engine.dispose()

        cfg = Config("alembic.ini")
        cfg.set_main_option("sqlalchemy.url", url)
        cfg.set_main_option("script_location", "migrations/tenant")

        def _run() -> None:
            if not has_version:
                command.stamp(cfg, PRE_F1_HEAD)
            command.upgrade(cfg, "head")

        try:
            await asyncio.get_event_loop().run_in_executor(None, _run)
            print(f"OK   {tenant.db_name}")
            ok += 1
        except Exception as e:
            print(f"FAIL {tenant.db_name}: {type(e).__name__}: {e}")
            failed += 1

    print(f"\n{ok} migradas, {failed} con error de {len(tenants)} tenants")


if __name__ == "__main__":
    asyncio.run(migrate_all())
