"""Pase del día: registro exprés del visitante y venta del pase.

El visitante es un Member liviano (member_type=visitor, sin PAR-Q ni plan)
para que el kiosko, la recepción y el torniquete lo resuelvan por cédula igual
que a un socio. Convertirlo en socio es completar sus datos y asignarle plan.
"""
import uuid
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.tenant.day_pass import DayPass, DayPassStatus, DayPassType
from app.models.tenant.gym_settings import GymSettings
from app.models.tenant.member import Member, MemberStatus, MemberType, IdType
from app.models.tenant.payment import Payment, PaymentKind, PaymentMethod, PaymentStatus
from app.services.payments import apply_payment_policy


async def find_or_create_visitor(
    db: AsyncSession,
    id_number: str,
    full_name: str,
    phone: str | None,
) -> tuple[Member, bool]:
    """Devuelve (member, es_nuevo). Si la cédula ya existe (socio o visitante)
    se reutiliza la ficha; solo se completa el teléfono si faltaba."""
    id_number = id_number.strip()
    member = (await db.execute(
        select(Member).where(Member.id_number == id_number)
    )).scalar_one_or_none()
    if member:
        if phone and not member.phone:
            member.phone = phone
        return member, False
    member = Member(
        full_name=full_name.strip(),
        email=None,
        phone=phone,
        id_type=IdType.CC,
        id_number=id_number,
        member_type=MemberType.visitor.value,
        status=MemberStatus.active,
    )
    try:
        # Savepoint: si otra venta simultánea ya insertó la misma cédula, el índice
        # único la rechaza y reutilizamos esa ficha en vez de fallar con 500
        async with db.begin_nested():
            db.add(member)
            await db.flush()
    except IntegrityError:
        existing = (await db.execute(
            select(Member).where(Member.id_number == id_number)
        )).scalar_one_or_none()
        if existing is None:
            raise
        return existing, False
    return member, True


async def active_pass_today(db: AsyncSession, member_id: uuid.UUID) -> DayPass | None:
    return (await db.execute(
        select(DayPass).where(
            DayPass.member_id == member_id,
            DayPass.valid_on == today_bogota(),
            DayPass.status == DayPassStatus.active.value,
        ).order_by(desc(DayPass.created_at)).limit(1)
    )).scalar_one_or_none()


async def open_pass_today(db: AsyncSession, member_id: uuid.UUID) -> DayPass | None:
    """Pase de hoy activo O pendiente de pago (para no vender dos veces)."""
    return (await db.execute(
        select(DayPass).where(
            DayPass.member_id == member_id,
            DayPass.valid_on == today_bogota(),
            DayPass.status != DayPassStatus.void.value,
        ).order_by(desc(DayPass.created_at)).limit(1)
    )).scalar_one_or_none()


async def sell_day_pass(
    db: AsyncSession,
    *,
    gym: GymSettings,
    member: Member,
    pass_type: DayPassType,
    method: PaymentMethod,
    received_by: uuid.UUID | None,
    transfer_account_id: str | None = None,
    card_approval_code: str | None = None,
    card_terminal: str | None = None,
) -> tuple[DayPass, Payment, dict | None]:
    """Crea el pago (kind=day_pass) y el pase del día de hoy. cash/card quedan
    pagados y el pase activo; transfer/wompi quedan pendientes hasta confirmar.
    NO hace commit."""
    if not pass_type.is_active:
        raise HTTPException(status_code=409, detail=f"El pase '{pass_type.name}' está archivado")
    today = today_bogota()
    existing = await open_pass_today(db, member.id)
    if existing:
        estado = "activo" if existing.status == DayPassStatus.active.value else "pendiente de pago"
        raise HTTPException(status_code=409, detail=f"{member.full_name} ya tiene un pase {estado} para hoy")

    payment = Payment(
        member_id=member.id,
        amount=Decimal(str(pass_type.price)),
        method=method,
        status=PaymentStatus.pending if method == PaymentMethod.wompi else PaymentStatus.paid,
        concept=f"Pase del día · {pass_type.name}",
        kind=PaymentKind.day_pass.value,
        received_by=received_by,
    )
    account = await apply_payment_policy(
        db, payment, gym,
        transfer_account_id=transfer_account_id,
        card_approval_code=card_approval_code,
        card_terminal=card_terminal,
    )
    db.add(payment)
    await db.flush()

    day_pass = DayPass(
        member_id=member.id,
        pass_type_id=pass_type.id,
        pass_name=pass_type.name,
        includes_trainer=pass_type.includes_trainer,
        valid_on=today,
        price=payment.amount,
        payment_id=payment.id,
        status=DayPassStatus.active.value if payment.status == PaymentStatus.paid else DayPassStatus.pending.value,
        created_by=received_by,
    )
    db.add(day_pass)
    await db.flush()
    return day_pass, payment, account
