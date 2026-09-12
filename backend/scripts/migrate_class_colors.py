"""Normaliza `gym_classes.color` de nombre CSS a hex en todas las tenant DBs.

El formulario de clases guardaba el color como nombre ("orange", "blue"), pero
el modelo lo declara como hex de 7 caracteres y la agenda, el panel y el portal
del entrenador lo pintan con `style={{ background: color }}`. Los nombres son
colores CSS válidos, así que nada se rompía a la vista: simplemente se pintaba
el naranja del navegador en vez del de la paleta.

Un color fuera del mapa NO se toca: vaciarlo borraría una decisión del gimnasio
sin que nadie lo pidiera. Se reporta al final para que se revise a mano.

No usa `for_each_tenant`: ese helper salta los tenants suspendidos, y una
migracion de datos tiene que alcanzarlos igual — un gimnasio suspendido puede
reactivarse y sus filas seguirian con el formato viejo. El engine desechable con
NullPool si se copia de ahi, por el agotamiento de conexiones ya documentado.

Uso (desde backend/):
    python scripts/migrate_class_colors.py --dry-run
    python scripts/migrate_class_colors.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.master_session import MasterSessionLocal  # noqa: E402
from app.models.master.tenant import Tenant  # noqa: E402

COLOR_MAP = {
    "orange": "#F97316",
    "blue": "#3B82F6",
    "green": "#22C55E",
    "red": "#EF4444",
    "purple": "#A855F7",
    "pink": "#EC4899",
    "cyan": "#06B6D4",
    "yellow": "#FACC15",
}


def normalize_color(value: str | None) -> str | None:
    """Hex al que migrar `value`, o None si no hay equivalente y no debe tocarse.

    Un hex ya migrado se devuelve tal cual: correr el script dos veces no cambia
    nada.
    """
    if not value:
        return None
    if value.startswith("#"):
        return value
    return COLOR_MAP.get(value.strip().lower())


async def migrate(dry_run: bool) -> int:
    async with MasterSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()

    total, touched_dbs, failed = 0, 0, []
    sin_equivalente: list[str] = []
    for tenant in tenants:
        url = settings.tenant_database_url_template.replace("{db_name}", tenant.db_name)
        engine = create_async_engine(url, poolclass=NullPool)
        try:
            async with engine.begin() as conn:
                rows = (
                    await conn.execute(
                        text(
                            "SELECT color, count(*) FROM gym_classes "
                            "WHERE color IS NOT NULL AND color <> '' AND color NOT LIKE '#%' "
                            "GROUP BY color"
                        )
                    )
                ).all()
                if not rows:
                    continue

                migrables = [(name, n, normalize_color(name)) for name, n in rows]
                for name, n, hexa in migrables:
                    if hexa is None:
                        sin_equivalente.append(f"{tenant.db_name}: '{name}' x{n}")
                        continue
                    total += n
                    print(f"{'[dry] ' if dry_run else ''}{tenant.db_name}: '{name}' x{n} -> {hexa}")
                    if not dry_run:
                        await conn.execute(
                            text("UPDATE gym_classes SET color = :new WHERE color = :old"),
                            {"new": hexa, "old": name},
                        )
                if any(h is not None for _, _, h in migrables):
                    touched_dbs += 1
        except Exception as e:
            failed.append(f"{tenant.db_name}: {type(e).__name__}: {e}")
        finally:
            await engine.dispose()

    verbo = "por migrar" if dry_run else "migradas"
    print(f"\n{total} clases {verbo} en {touched_dbs} de {len(tenants)} tenants")
    if sin_equivalente:
        print(f"\n{len(sin_equivalente)} colores SIN EQUIVALENTE (no se tocan, revisar a mano):")
        for s in sin_equivalente[:20]:
            print(f"  - {s}")
    if failed:
        print(f"\n{len(failed)} tenants con error:")
        for f in failed:
            print(f"  - {f}")
    return len(failed)


if __name__ == "__main__":
    fallos = asyncio.run(migrate("--dry-run" in sys.argv))
    # Una migracion a medias no puede verse igual que una exitosa para quien la
    # encadena en un despliegue.
    sys.exit(1 if fallos else 0)
