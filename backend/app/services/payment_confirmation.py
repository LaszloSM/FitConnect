import uuid
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.tenant.member import Member
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.member_plan import MemberPlan
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.payment_link import PaymentLink
from app.services.receipts import issue_receipt


async def _apply_membership_intent(db: AsyncSession, intent: dict) -> None:
    """Crea/renueva la membresía descrita en el intent del payment_link."""
    member_id = uuid.UUID(intent["member_id"])
    plan_id = uuid.UUID(intent["plan_id"])
    plan = (await db.execute(select(MemberPlan).where(MemberPlan.id == plan_id))).scalar_one_or_none()
    if not plan:
        return
    # Renovación: si hay una membresía vigente del mismo plan, arranca al día siguiente.
    today = today_bogota()
    active = (await db.execute(
        select(Membership)
        .where(
            Membership.member_id == member_id,
            Membership.status == MembershipStatus.active.value,
            Membership.end_date >= today,
        )
        .order_by(Membership.end_date.desc())
        .limit(1)
    )).scalar_one_or_none()
    start = (active.end_date + timedelta(days=1)) if active else today
    db.add(Membership(
        member_id=member_id,
        plan_id=plan.id,
        plan_name=plan.name,
        price=plan.price,
        start_date=start,
        end_date=start + timedelta(days=plan.duration_days),
        duration_days=plan.duration_days,
        status=MembershipStatus.active.value,
    ))


async def confirm_payment(db: AsyncSession, payment_id: uuid.UUID, transaction_id: str | None) -> bool:
    """Transición pending→paid idempotente (única fuente de verdad para webhook
    y reconciliación). Devuelve True si esta llamada hizo la transición."""
    result = await db.execute(
        update(Payment)
        .where(Payment.id == payment_id, Payment.status == PaymentStatus.pending)
        .values(status=PaymentStatus.paid, method=PaymentMethod.wompi, external_ref=transaction_id)
    )
    if result.rowcount == 0:
        return False  # ya estaba confirmado u otro proceso ganó la carrera

    payment = (await db.execute(select(Payment).where(Payment.id == payment_id))).scalar_one()
    await issue_receipt(db, payment)

    link = (await db.execute(
        select(PaymentLink).where(PaymentLink.payment_id == payment_id)
    )).scalar_one_or_none()
    if link:
        link.status = "paid"
        if link.membership_intent:
            await _apply_membership_intent(db, link.membership_intent)

    member = (await db.execute(select(Member).where(Member.id == payment.member_id))).scalar_one_or_none()
    from app.services.events import emit
    await emit(
        db, "payment.confirmed",
        idempotency_key=f"payconfirm:{payment.id}",
        title="Pago confirmado",
        message=f"{member.full_name if member else 'Un miembro'} pagó {payment.amount} por {payment.concept}.",
        member_id=payment.member_id,
        phone=member.phone if member else None,
        template_params=[member.full_name if member else "Miembro", str(payment.amount), payment.concept],
    )
    return True
