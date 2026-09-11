"""A quién le llega un anuncio.

Un envío masivo sin saber a cuántos le llega es un incidente esperando: por eso
el segmento se puede previsualizar (cuántos y quiénes) ANTES de enviar.
"""
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota, utcnow_naive
from app.models.tenant.checkin import CheckIn
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.membership import Membership, MembershipStatus

INACTIVE_DAYS = 21
EXPIRING_DAYS = 7


@dataclass(frozen=True)
class Segment:
    key: str
    label: str
    description: str
    #: Nombre del parámetro que necesita, si lo necesita.
    param: str | None = None


SEGMENTS: dict[str, Segment] = {
    "all_members": Segment(
        "all_members", "Todos los socios activos",
        "Socios con estado activo, tengan o no membresía vigente.",
    ),
    "with_membership": Segment(
        "with_membership", "Con membresía vigente",
        "Los que hoy pueden entrar.",
    ),
    "expiring": Segment(
        "expiring", f"Vencen en {EXPIRING_DAYS} días",
        "Para avisar de una promoción de renovación.",
    ),
    "overdue": Segment(
        "overdue", "Con membresía vencida",
        "Cartera por recuperar.",
    ),
    "inactive": Segment(
        "inactive", f"Sin venir hace {INACTIVE_DAYS} días",
        "Socios en riesgo de abandono, con membresía vigente.",
    ),
    "birthday_month": Segment(
        "birthday_month", "Cumplen este mes",
        "Para una campaña de cumpleaños.",
    ),
    "by_plan": Segment(
        "by_plan", "De un plan concreto",
        "Los que tienen hoy una membresía vigente de ese plan.",
        param="plan_id",
    ),
}


def _base() -> Select:
    return select(Member).where(Member.status == MemberStatus.active, Member.member_type == "member")


def build_query(segment: str, params: dict | None = None) -> Select:
    """Consulta de socios del segmento. Lanza ValueError si no existe."""
    params = params or {}
    if segment not in SEGMENTS:
        raise ValueError(f"Segmento desconocido: {segment}")

    today = today_bogota()
    stmt = _base()

    if segment == "all_members":
        return stmt

    vigentes = (
        select(Membership.member_id)
        .where(
            Membership.status == MembershipStatus.active.value,
            Membership.start_date <= today,
            Membership.end_date >= today,
        )
        .distinct()
        .scalar_subquery()
    )

    if segment == "with_membership":
        return stmt.where(Member.id.in_(vigentes))

    if segment == "expiring":
        proximos = (
            select(Membership.member_id)
            .where(
                Membership.status == MembershipStatus.active.value,
                Membership.start_date <= today,
                Membership.end_date >= today,
                Membership.end_date <= today + timedelta(days=EXPIRING_DAYS),
            )
            .distinct()
            .scalar_subquery()
        )
        return stmt.where(Member.id.in_(proximos))

    if segment == "overdue":
        vencidos = (
            select(Membership.member_id)
            .where(
                Membership.status.in_([
                    MembershipStatus.active.value, MembershipStatus.expired.value,
                ]),
                Membership.end_date < today,
            )
            .distinct()
            .scalar_subquery()
        )
        # Vencido de verdad: no vale si ya renovó y tiene otra vigente.
        return stmt.where(Member.id.in_(vencidos), Member.id.not_in(vigentes))

    if segment == "inactive":
        # `created_at` es UTC naive: el cutoff también (nunca now_bogota()).
        cutoff = utcnow_naive() - timedelta(days=INACTIVE_DAYS)
        recientes = select(CheckIn.member_id).where(CheckIn.created_at >= cutoff).distinct().scalar_subquery()
        return stmt.where(Member.id.in_(vigentes), Member.id.not_in(recientes))

    if segment == "birthday_month":
        return stmt.where(
            Member.birth_date.isnot(None),
            func.extract("month", Member.birth_date) == today.month,
        )

    if segment == "by_plan":
        plan_id = params.get("plan_id")
        if not plan_id:
            raise ValueError("Este segmento necesita un plan")
        del_plan = (
            select(Membership.member_id)
            .where(
                Membership.plan_id == plan_id,
                Membership.status == MembershipStatus.active.value,
                Membership.start_date <= today,
                Membership.end_date >= today,
            )
            .distinct()
            .scalar_subquery()
        )
        return stmt.where(Member.id.in_(del_plan))

    raise ValueError(f"Segmento sin implementar: {segment}")


async def resolve_members(db: AsyncSession, segment: str, params: dict | None = None) -> list[Member]:
    return list((await db.execute(
        build_query(segment, params).order_by(Member.full_name)
    )).scalars().all())
