"""Le da a un gimnasio de QA diez meses de historia para que los modelos tengan con qué entrenar.

`seed_demo_gym.py` crea un gimnasio de hoy: sus socios nacen hoy y ningún modelo
puede aprender nada de un solo día. Este script escribe directo en la base del
tenant (la API no permite fechar hacia atrás) socios con membresías encadenadas,
visitas con hábitos distintos y pagos, con tres destinos: fieles, ocasionales y
socios que se van. Solo para desarrollo.

Uso (desde backend/):
    python scripts/seed_ml_history.py --slug gym-demo-xxxx --members 320
"""
import argparse
import asyncio
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
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

NOMBRES = ["Ana", "Carlos", "Lucía", "Andrés", "Valentina", "Julián", "Camila", "Mateo", "Daniela", "Sebastián",
           "Paula", "Felipe", "Mariana", "Santiago", "Isabella", "Nicolás", "Sofía", "Tomás", "Laura", "David"]
APELLIDOS = ["Ramírez", "Gómez", "Torres", "Rojas", "Castro", "Mendoza", "Vargas", "Pineda", "Salazar", "Correa"]

PERFILES = {
    #            peso, renueva, visitas/semana, horas preferidas
    "fiel":      (0.40, 0.92, 4.2, (6, 7, 18)),
    "ocasional": (0.35, 0.62, 1.6, (12, 13, 17)),
    "se_va":     (0.25, 0.28, 2.6, (19, 20)),
}
PLANES = [("Mensual", 30, 85000, 95000), ("Trimestral", 90, 230000, 250000)]


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
    socios = membresias = visitas = pagos = 0
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            for i in range(n_members):
                perfil = rng.choices(list(PERFILES), weights=[p[0] for p in PERFILES.values()])[0]
                _, renueva, por_semana, horas = PERFILES[perfil]
                creado = hoy - timedelta(days=rng.randint(20, 300))
                socio = Member(
                    id=uuid.uuid4(), full_name=f"{rng.choice(NOMBRES)} {rng.choice(APELLIDOS)}",
                    phone=f"30{rng.randint(10000000, 99999999)}", member_type="member",
                    status=MemberStatus.active, created_at=_utc(creado, 9, 0), updated_at=_utc(creado, 9, 0),
                )
                db.add(socio)
                # Sin relaciones ORM entre estos modelos, la unidad de trabajo no
                # sabe que el socio va antes que sus visitas: flush explícito.
                await db.flush()
                socios += 1
                plan, dias, precio_viejo, precio_nuevo = rng.choices(PLANES, weights=[0.8, 0.2])[0]
                inicio = creado
                while inicio <= hoy:
                    precio = precio_viejo if inicio < hoy - timedelta(days=150) else precio_nuevo
                    fin = inicio + timedelta(days=dias - 1)
                    ms = Membership(
                        id=uuid.uuid4(), member_id=socio.id, plan_name=plan, price=precio,
                        start_date=inicio, end_date=fin, duration_days=dias,
                        status="active" if fin >= hoy else "expired",
                        created_at=_utc(inicio, 9, 5), updated_at=_utc(inicio, 9, 5),
                    )
                    db.add(ms)
                    await db.flush()
                    membresias += 1
                    db.add(Payment(
                        member_id=socio.id, membership_id=ms.id, amount=precio,
                        method=rng.choice([PaymentMethod.cash, PaymentMethod.card, PaymentMethod.transfer]),
                        status=PaymentStatus.paid, concept=f"Membresía {plan}", kind="membership",
                        created_at=_utc(inicio, rng.choice(horas), rng.randint(0, 50)), updated_at=_utc(inicio, 9, 10),
                    ))
                    pagos += 1
                    se_va = rng.random() > renueva
                    d = inicio
                    while d <= min(fin, hoy - timedelta(days=1)):
                        apagado = se_va and (fin - d).days < 16
                        ritmo = por_semana * (1.25 if d.weekday() in (0, 1, 2) else 0.8 if d.weekday() >= 5 else 1)
                        if not apagado and rng.random() < ritmo / 7:
                            ts = _utc(d, rng.choice(horas), rng.randint(0, 59))
                            db.add(CheckIn(member_id=socio.id, created_at=ts, updated_at=ts, decision="allowed", source="reception"))
                            visitas += 1
                        d += timedelta(days=1)
                    if se_va:
                        socio.status = MemberStatus.inactive if fin < hoy - timedelta(days=30) else MemberStatus.active
                        break
                    inicio = fin + timedelta(days=1)
                if i % 50 == 49:
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
