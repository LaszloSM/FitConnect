from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.tenant.membership import Membership, MembershipStatus


def effective_status(
    membership: Membership,
    today: date | None = None,
    grace_days: int = 0,
) -> str:
    """Estado real de una membresía derivado de end_date/status (compute-on-read).

    Única fuente de verdad para check-in, reservas y reportes. Devuelve:
    active | scheduled | frozen | in_grace | expired | cancelled.

    `scheduled` = aún no inicia (renovación encadenada): no da acceso ni cuenta
    como vigente para la UI, pero sí para el encadenamiento de renovaciones.
    `in_grace` = venció hace <= grace_days (el gym decide si deja entrar con aviso).
    El campo persistido `status` solo lo escriben las transiciones explícitas
    (cancel, freeze/unfreeze) y el job diario de expiración.
    """
    today = today or today_bogota()
    if membership.status == MembershipStatus.cancelled:
        return "cancelled"
    if membership.status == MembershipStatus.frozen:
        return "frozen"
    if membership.start_date > today:
        return "scheduled"
    if membership.end_date < today:
        if grace_days > 0 and today <= membership.end_date + timedelta(days=grace_days):
            return "in_grace"
        return "expired"
    return "active"


async def next_chain_start(
    db: AsyncSession,
    member_id,
    grace_days: int,
    requested: date,
    today: date | None = None,
) -> date:
    """Fecha de inicio real para una membresía nueva: si el miembro ya tiene una
    vigente/congelada/programada, encadena al día siguiente de la que termina más
    tarde (no se pierden días pagados ni se solapan)."""
    today = today or today_bogota()
    memberships = (await db.execute(
        select(Membership)
        .where(Membership.member_id == member_id)
        .order_by(Membership.end_date.desc())
    )).scalars().all()
    for m in memberships:
        if effective_status(m, today=today, grace_days=grace_days) in ("active", "frozen", "scheduled"):
            return max(requested, m.end_date + timedelta(days=1))
    return requested
