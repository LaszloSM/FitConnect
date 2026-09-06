"""Alinea TODAS las tenant DBs registradas en Master con el esquema actual.

Uso (dentro del contenedor backend):
    python migrate_tenants.py

En este sistema el esquema de cada tenant lo bootstrapea `create_all` de los
modelos actuales (ver tenant_service.py), NO la cadena de migraciones. Por eso
muchas DBs tienen el esquema "adelante" de su revisión de alembic (schema-drift):
replayar migraciones sobre ellas choca con lo que ya existe (DuplicateColumn /
DuplicateTable / enums duplicados).

La estrategia, idéntica a cómo nace un tenant nuevo: reconciliar lo que falte con
`create_all` (idempotente: no toca lo existente) y `stamp head` para que la
contabilidad de alembic refleje la realidad. Así la PRÓXIMA migración (columna
nueva) aplica limpio vía upgrade. Práctica complementaria: en migraciones nuevas
usar `ADD COLUMN IF NOT EXISTS` y ligar secuencias/índices a TenantBase.metadata.
"""
import asyncio

from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.master_session import MasterSessionLocal
from app.db.tenant_base import TenantBase
from app.db.tenant_align import ALIGN_STATEMENTS
from app.models.master.tenant import Tenant


def _stamp_head(url: str) -> None:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.set_main_option("script_location", "migrations/tenant")
    command.stamp(cfg, "head")


async def migrate_all() -> None:
    async with MasterSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()

    ok, failed = 0, 0
    failures: list[str] = []
    for tenant in tenants:
        url = settings.tenant_database_url_template.replace("{db_name}", tenant.db_name)
        engine = create_async_engine(url)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(TenantBase.metadata.create_all)
                # create_all no agrega columnas a tablas existentes: aplicar el DDL
                # idempotente de las migraciones que tocan tablas ya creadas
                for sql in ALIGN_STATEMENTS:
                    await conn.execute(text(sql))
            await asyncio.get_event_loop().run_in_executor(None, _stamp_head, url)
            print(f"OK   {tenant.db_name}")
            ok += 1
        except Exception as e:
            print(f"FAIL {tenant.db_name}: {type(e).__name__}: {e}")
            failures.append(tenant.db_name)
            failed += 1
        finally:
            await engine.dispose()

    print(f"\n{ok} alineadas, {failed} con error de {len(tenants)} tenants")
    if failures:
        print("Tenants con error (revisar manualmente):")
        for db_name in failures:
            print(f"  - {db_name}")


if __name__ == "__main__":
    asyncio.run(migrate_all())
