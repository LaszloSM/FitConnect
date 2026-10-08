"""Le da a un gimnasio de QA diez meses de historia para que los modelos tengan con qué entrenar.

`seed_demo_gym.py` crea un gimnasio de hoy: sus socios nacen hoy y ningún modelo
puede aprender nada de un solo día. Este script escribe directo en la base del
tenant (la API no permite fechar hacia atrás) socios con membresías encadenadas,
visitas y pagos que salen del simulador realista (`app/services/ml/simulator.py`):
nada de perfiles con la respuesta sembrada. Solo para desarrollo.

Uso (desde backend/):
    python scripts/seed_ml_history.py --slug gym-demo-xxxx --members 320
"""
import argparse
import asyncio
import random
import sys
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.timeutil import BOGOTA, today_bogota  # noqa: E402
from app.db.master_session import MasterSessionLocal  # noqa: E402
from app.models.master.tenant import Tenant  # noqa: E402
from app.models.tenant.checkin import CheckIn  # noqa: E402
from app.models.tenant.member import Member, MemberStatus  # noqa: E402
from app.models.tenant.membership import Membership  # noqa: E402
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus  # noqa: E402
from app.services.ml.simulator import simulate  # noqa: E402

NOMBRES = ["Ana", "Carlos", "Lucía", "Andrés", "Valentina", "Julián", "Camila", "Mateo", "Daniela", "Sebastián",
           "Paula", "Felipe", "Mariana", "Santiago", "Isabella", "Nicolás", "Sofía", "Tomás", "Laura", "David"]
APELLIDOS = ["Ramírez", "Gómez", "Torres", "Rojas", "Castro", "Mendoza", "Vargas", "Pineda", "Salazar", "Correa"]

def _utc(d: date, hour: int, minute: int) -> datetime:
    local = datetime(d.year, d.month, d.day, hour, minute, tzinfo=BOGOTA)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


async def seed(slug: str, n_members: int, seed_value: int) -> None:
    rng = random.Random(seed_value)
    async with MasterSessionLocal() as master:
        tenant = (await master.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none()
    if not tenant:
        sys.exit(f"No existe el gimnasio {slug}")
    if settings.environment == "production":
        sys.exit("Este script es solo para desarrollo")

    engine = create_async_engine(settings.tenant_database_url_template.replace("{db_name}", tenant.db_name), poolclass=NullPool)
    hoy = today_bogota()
    # La historia sale del simulador realista (app/services/ml/simulator.py): el
    # compromiso de cada socio cambia semana a semana y renovar depende de él con
    # ruido. Ningún rasgo trae la respuesta sembrada.
    h = simulate(hoy, members=n_members, seed=seed_value)
    socios = membresias = visitas = pagos = 0
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            for mid, info in h.members.items():
                socio = Member(
                    id=mid, full_name=f"{rng.choice(NOMBRES)} {rng.choice(APELLIDOS)}",
                    phone=f"30{rng.randint(10000000, 99999999)}", member_type="member",
                    status=MemberStatus.active if info.active else MemberStatus.inactive,
                    created_at=_utc(info.created, 9, 0), updated_at=_utc(info.created, 9, 0),
                )
                db.add(socio)
                # Sin relaciones ORM entre estos modelos, la unidad de trabajo no
                # sabe que el socio va antes que sus visitas: flush explícito.
                await db.flush()
                socios += 1
                for st in h.stints.get(mid, []):
                    registrado = st.created or st.start
                    ms = Membership(
                        id=uuid.uuid4(), member_id=mid, plan_name=st.plan_name, price=st.price,
                        start_date=st.start, end_date=st.end, duration_days=st.duration,
                        status="active" if st.end >= hoy else "expired",
                        created_at=_utc(registrado, 9, 5), updated_at=_utc(registrado, 9, 5),
                    )
                    db.add(ms)
                    await db.flush()
                    membresias += 1
                    if registrado < hoy:
                        db.add(Payment(
                            member_id=mid, membership_id=ms.id, amount=st.price,
                            method=rng.choice([PaymentMethod.cash, PaymentMethod.card, PaymentMethod.transfer]),
                            status=PaymentStatus.paid, concept=f"Membresía {st.plan_name}", kind="membership",
                            created_at=_utc(registrado, 10, rng.randint(0, 50)), updated_at=_utc(registrado, 10, 55),
                        ))
                        pagos += 1
                for d, hour in h.hours.get(mid, []):
                    ts = _utc(d, hour, rng.randint(0, 59))
                    db.add(CheckIn(member_id=mid, created_at=ts, updated_at=ts, decision="allowed", source="reception"))
                    visitas += 1
                if socios % 50 == 0:
                    await db.flush()
            await db.commit()
    finally:
        await engine.dispose()
    print(f"{slug}: {socios} socios, {membresias} membresías, {pagos} pagos, {visitas} visitas")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--members", type=int, default=320)
    ap.add_argument("--seed", type=int, default=11)
    a = ap.parse_args()
    asyncio.run(seed(a.slug, a.members, a.seed))
