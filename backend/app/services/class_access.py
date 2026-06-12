"""Validación de acceso a clases según los derechos comprados (snapshot en la
membresía): solo máquinas / clases ilimitadas / N clases por mes de membresía.
Es el modelo estándar del mercado (Mindbody, Glofox, Fitco)."""
import uuid
from dataclasses import dataclass

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.tenant.class_session import ClassSession
from app.models.tenant.membership import Membership
from app.models.tenant.session_booking import SessionBooking
from app.services.membership_status import effective_status


@dataclass
class ClassAccess:
    result: str  # ok | no_membership | no_class_access | no_credits
    detail: str | None = None
    credits_total: int | None = None  # None = ilimitadas
    credits_used: int = 0

    @property
    def credits_remaining(self) -> int | None:
        if self.credits_total is None:
            return None
        return max(self.credits_total - self.credits_used, 0)


async def validate_class_access(
    db: AsyncSession,
    member_id: uuid.UUID,
    grace_days: int,
) -> ClassAccess:
    today = today_bogota()
    memberships = (await db.execute(
        select(Membership).where(Membership.member_id == member_id)
        .order_by(desc(Membership.end_date))
    )).scalars().all()

    current = None
    for m in memberships:
        if effective_status(m, today=today, grace_days=grace_days) in ("active", "in_grace"):
            current = m
            break
    if current is None:
        return ClassAccess(result="no_membership", detail="El miembro no tiene una membresía vigente")

    if current.access_type == "gym_only":
        return ClassAccess(
            result="no_class_access",
            detail=f"El plan {current.plan_name} no incluye clases",
        )

    if current.class_credits_per_month is None:
        return ClassAccess(result="ok", credits_total=None)

    # Créditos consumidos = reservas vivas (booked/attended/no_show) en sesiones
    # dentro del período de ESTA membresía. Cancelar una reserva devuelve el crédito.
    used = (await db.execute(
        select(func.count())
        .select_from(SessionBooking)
        .join(ClassSession, ClassSession.id == SessionBooking.session_id)
        .where(
            SessionBooking.member_id == member_id,
            SessionBooking.status.in_(["booked", "attended", "no_show"]),
            ClassSession.session_date >= current.start_date,
            ClassSession.session_date <= current.end_date,
        )
    )).scalar_one()

    if used >= current.class_credits_per_month:
        return ClassAccess(
            result="no_credits",
            detail=f"Sin clases disponibles este período: {used}/{current.class_credits_per_month} usadas",
            credits_total=current.class_credits_per_month,
            credits_used=used,
        )
    return ClassAccess(result="ok", credits_total=current.class_credits_per_month, credits_used=used)
