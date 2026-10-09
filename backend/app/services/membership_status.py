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


async def recompute_member_chain(
    db: AsyncSession,
    member_id,
    grace_days: int = 0,
    today: date | None = None,
    actor=None,
) -> list[dict]:
    """Cierra los huecos de vigencia que deja una reversa.

    Cada cobro encadena su membresía al día siguiente de la que termina más
    tarde (`next_chain_start`). Cuando una del medio se cancela —porque se anuló
    o se devolvió el pago que la originó— las posteriores conservan su fecha
    desplazada y queda un hueco: el socio llega 40 días después y el torniquete
    lo rechaza. Como la caja del día cuadra igual, el error es invisible hasta
    que alguien reclama.

    Solo se mueven las membresías PROGRAMADAS (empiezan en el futuro): una en
    curso no se toca y nada se lleva al pasado. Devuelve lo que cambió, para
    dejarlo en la auditoría.
    """
    from app.services.audit import audit

    today = today or today_bogota()
    memberships = (await db.execute(
        select(Membership)
        .where(Membership.member_id == member_id)
        .order_by(Membership.start_date)
    )).scalars().all()

    changes: list[dict] = []
    cursor: date | None = None
    for m in memberships:
        state = effective_status(m, today=today, grace_days=grace_days)
        if state == "cancelled":
            continue
        if state == "scheduled":
            # Sin predecesora viva la programada arranca hoy: si se devolvió el
            # pago de la vigente, el socio no puede quedarse esperando su fecha vieja.
            target = today if cursor is None else max(cursor + timedelta(days=1), today)
            if target < m.start_date:
                span = m.end_date - m.start_date
                changes.append({
                    "membership_id": str(m.id),
                    "from": m.start_date.isoformat(),
                    "to": target.isoformat(),
                })
                m.start_date = target
                m.end_date = target + span
        cursor = m.end_date if cursor is None else max(cursor, m.end_date)

    if changes:
        audit(db, actor, "membership.rechain", "member", member_id, {"moved": changes})
    return changes


def charged_here(membership: Membership) -> bool:
    """La membresía se vendió en FitConnect. Las importadas (ya cobradas en el
    software anterior) y las de cortesía tienen precio 0: ese precio no sirve
    como monto de renovación ni de deuda."""
    return getattr(membership, "source", "sale") == "sale"
