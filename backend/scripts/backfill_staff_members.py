"""Crea la ficha de socio del personal en los gimnasios que ya existian.

Desde ahora cada persona del equipo nace con su ficha, pero los gimnasios dados
de alta antes tienen a su dueno, su staff y sus entrenadores sin forma de entrar
al gimnasio: ni QR, ni huella, ni torniquete.

Es idempotente: `ensure_staff_member` reusa la ficha si ya existe, asi que
volver a correrlo no duplica nada.

No usa `for_each_tenant`: ese helper salta los tenants suspendidos y un relleno
de datos tiene que alcanzarlos igual.

Uso (desde backend/):
    python scripts/backfill_staff_members.py --dry-run
    python scripts/backfill_staff_members.py
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
from app.models.tenant.instructor import Instructor  # noqa: E402
from app.models.tenant.member import Member  # noqa: E402
from app.models.tenant.user_staff import UserStaff  # noqa: E402
from app.services.staff_member import ensure_staff_member  # noqa: E402


async def backfill(dry_run: bool) -> int:
    async with MasterSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()

    creadas, tenants_tocados, failed = 0, 0, []
    for tenant in tenants:
        url = settings.tenant_database_url_template.replace("{db_name}", tenant.db_name)
        engine = create_async_engine(url, poolclass=NullPool)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as session:
                personal = (await session.execute(
                    select(UserStaff).where(UserStaff.is_active.is_(True))
                )).scalars().all()
                # Solo las fichas sin cuenta: las enlazadas ya entran por su usuario.
                sueltos = (await session.execute(
                    select(Instructor).where(
                        Instructor.is_active.is_(True), Instructor.staff_id.is_(None)
                    )
                )).scalars().all()
                if not personal and not sueltos:
                    continue

                # Un dry-run que cuenta tambien las fichas que ya existen no dice
                # cuanto falta: se descuentan las ya enlazadas.
                ya_con_ficha = set((await session.execute(
                    select(Member.staff_id).where(Member.staff_id.is_not(None))
                )).scalars().all())
                ya_sueltos = set((await session.execute(
                    select(Member.instructor_profile_id)
                    .where(Member.instructor_profile_id.is_not(None))
                )).scalars().all())
                personal = [u for u in personal if u.id not in ya_con_ficha]
                sueltos = [i for i in sueltos if i.id not in ya_sueltos]
                if not personal and not sueltos:
                    continue

                tenants_tocados += 1
                creadas += len(personal) + len(sueltos)
                print(f"{'[dry] ' if dry_run else ''}{tenant.db_name}: {len(personal)} con cuenta, {len(sueltos)} sin cuenta")
                if dry_run:
                    continue

                for u in personal:
                    await ensure_staff_member(
                        session, full_name=u.full_name, email=u.email, staff_id=u.id
                    )
                for i in sueltos:
                    await ensure_staff_member(
                        session, full_name=i.full_name, phone=i.phone, instructor_id=i.id
                    )
                await session.commit()
        except Exception as e:
            failed.append(f"{tenant.db_name}: {type(e).__name__}: {e}")
        finally:
            await engine.dispose()

    verbo = "por crear" if dry_run else "aseguradas"
    print(f"\n{creadas} fichas {verbo} en {tenants_tocados} de {len(tenants)} tenants")
    if failed:
        print(f"\n{len(failed)} tenants con error:")
        for f in failed[:15]:
            print(f"  - {f}")
    return len(failed)


if __name__ == "__main__":
    fallos = asyncio.run(backfill("--dry-run" in sys.argv))
    sys.exit(1 if fallos else 0)
