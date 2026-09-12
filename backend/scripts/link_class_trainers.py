"""Empareja por nombre las clases que guardan el entrenador como texto suelto.

Antes, si la lista de entrenadores llegaba vacia (o su fetch fallaba en
silencio), el formulario de clases caia a un input de texto libre: la clase se
guardaba con `instructor` escrito a mano y sin `instructor_id`. Esas clases no
tienen entrenador real, asi que `find_class_conflict` no puede detectar choques
de horario para ellas.

Lo que empareja por nombre se enlaza; lo que no, se lista para que el dueno lo
reasigne desde la pantalla de Clases (que ahora marca en ambar las clases sin
entrenador asignado y permite editarlas).

No usa `for_each_tenant`: ese helper salta los tenants suspendidos y una
correccion de datos tiene que alcanzarlos igual.

Uso (desde backend/):
    python scripts/link_class_trainers.py --dry-run
    python scripts/link_class_trainers.py
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
from app.models.tenant.gym_class import GymClass  # noqa: E402
from app.models.tenant.instructor import Instructor  # noqa: E402


def normalize(name: str | None) -> str:
    """Clave de comparacion: sin espacios extra ni mayusculas."""
    return " ".join((name or "").split()).lower()


async def link(dry_run: bool) -> int:
    async with MasterSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()

    enlazadas, huerfanas, failed = 0, [], []
    for tenant in tenants:
        url = settings.tenant_database_url_template.replace("{db_name}", tenant.db_name)
        engine = create_async_engine(url, poolclass=NullPool)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as session:
                sueltas = (await session.execute(
                    select(GymClass).where(GymClass.instructor_id.is_(None))
                )).scalars().all()
                if not sueltas:
                    continue

                fichas = (await session.execute(select(Instructor))).scalars().all()
                por_nombre: dict[str, list[Instructor]] = {}
                for f in fichas:
                    por_nombre.setdefault(normalize(f.full_name), []).append(f)

                for gc in sueltas:
                    candidatos = por_nombre.get(normalize(gc.instructor), [])
                    # Con dos fichas del mismo nombre no se puede elegir sin
                    # adivinar: se deja para que lo resuelva una persona.
                    if len(candidatos) != 1:
                        huerfanas.append(f"{tenant.db_name}: «{gc.name}» -> '{gc.instructor}'")
                        continue
                    print(f"{'[dry] ' if dry_run else ''}{tenant.db_name}: «{gc.name}» -> {candidatos[0].full_name}")
                    enlazadas += 1
                    if not dry_run:
                        gc.instructor_id = candidatos[0].id
                        gc.instructor = candidatos[0].full_name
                if not dry_run:
                    await session.commit()
        except Exception as e:
            failed.append(f"{tenant.db_name}: {type(e).__name__}: {e}")
        finally:
            await engine.dispose()

    verbo = "por enlazar" if dry_run else "enlazadas"
    print(f"\n{enlazadas} clases {verbo} de {len(tenants)} tenants")
    if huerfanas:
        print(f"\n{len(huerfanas)} clases SIN entrenador que emparejar (reasignar desde la UI):")
        for h in huerfanas[:20]:
            print(f"  - {h}")
        if len(huerfanas) > 20:
            print(f"  ... y {len(huerfanas) - 20} mas")
    if failed:
        print(f"\n{len(failed)} tenants con error:")
        for f in failed:
            print(f"  - {f}")
    return len(failed)


if __name__ == "__main__":
    fallos = asyncio.run(link("--dry-run" in sys.argv))
    sys.exit(1 if fallos else 0)
