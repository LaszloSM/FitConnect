"""Pasa `machines.area` de etiqueta en español a slug estable en todos los gyms.

La pantalla guardaba "Peso libre" como dato. Lo que no corresponda a ninguna
etiqueta conocida (texto libre de versiones viejas) queda como "otra" y el texto
original se agrega a las observaciones para no perderlo.

Idempotente: una fila que ya tiene slug no se toca. No usa `for_each_tenant`
porque ese helper salta los tenants suspendidos.

Uso (desde backend/):
    python scripts/migrate_machine_areas.py --dry-run
    python scripts/migrate_machine_areas.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.master_session import MasterSessionLocal  # noqa: E402
from app.models.master.tenant import Tenant  # noqa: E402
from app.models.tenant.machine import Machine  # noqa: E402
from app.services.machine_areas import AREA_LABELS, normalize_area  # noqa: E402


async def migrate(dry_run: bool) -> int:
    async with MasterSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()

    cambiadas, desconocidas, failed = 0, 0, []
    for tenant in tenants:
        url = settings.tenant_database_url_template.replace("{db_name}", tenant.db_name)
        engine = create_async_engine(url, poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                filas = (await session.execute(
                    select(Machine).where(Machine.area.is_not(None), Machine.area.not_in(list(AREA_LABELS)))
                )).scalars().all()
                for m in filas:
                    try:
                        slug = normalize_area(m.area)
                    except ValueError:
                        slug = "otra"
                        desconocidas += 1
                        nota = f"Área original: {m.area}"
                        m.notes = f"{m.notes} · {nota}"[:1000] if m.notes else nota
                    m.area = slug
                    cambiadas += 1
                if filas and not dry_run:
                    await session.commit()
        except Exception as exc:  # un tenant roto no detiene al resto
            failed.append((tenant.slug, repr(exc)))
        finally:
            await engine.dispose()

    modo = "(dry-run) " if dry_run else ""
    print(f"{modo}{cambiadas} máquinas pasadas a slug en {len(tenants)} tenants; {desconocidas} sin etiqueta conocida pasan a 'otra'")
    for slug, err in failed:
        print(f"  FALLÓ {slug}: {err}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(migrate("--dry-run" in sys.argv)))
