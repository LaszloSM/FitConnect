"""Avisos in-app de "membresía por vencer" (la campanita del panel).

Los generaba un POST que el panel disparaba al montar: en cada render, con el
error tragado, y con `REPORTS_READ` — así que para recepción SIEMPRE devolvía
403 y sus avisos no se creaban nunca. Ahora los crea el job diario, que ya
corre por tenant con advisory lock.
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.tenant.member import Member
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.notification import Notification

DEFAULT_DAYS = 7


async def generate_expiry_notices(db: AsyncSession, days: int = DEFAULT_DAYS) -> dict:
    """Un aviso por membresía que vence dentro de `days`. Idempotente: no
    duplica si ya hay uno sin leer con el mismo título."""
    today = today_bogota()
    cutoff = today + timedelta(days=days)

    rows = (await db.execute(
        select(Membership, Member.full_name)
        .join(Member, Member.id == Membership.member_id)
        .where(
            Membership.end_date <= cutoff,
            Membership.end_date >= today,
            Membership.status == MembershipStatus.active.value,
        )
        .order_by(Membership.end_date)
    )).all()

    created = 0
    for membership, full_name in rows:
        days_left = (membership.end_date - today).days
        title = f"Membresía por vencer: {full_name}"
        existing = (await db.execute(
            select(Notification.id).where(
                Notification.title == title,
                Notification.is_read.is_(False),
            ).limit(1)
        )).scalar_one_or_none()
        if existing:
            continue

        cuando = "hoy" if days_left == 0 else "mañana" if days_left == 1 else f"en {days_left} días"
        db.add(Notification(
            title=title,
            message=(
                f"La membresía '{membership.plan_name}' de {full_name} vence "
                f"{cuando} ({membership.end_date.isoformat()})."
            ),
            type="warning",
            is_read=False,
        ))
        created += 1

    return {"created": created, "total_expiring": len(rows)}
