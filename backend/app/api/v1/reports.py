from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract, not_, exists, cast, Integer
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.checkin import CheckIn
from app.models.tenant.membership import Membership, MembershipStatus

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/member-status")
async def member_status_report(db: AsyncSession = Depends(get_tenant_db_from_token)):
    stmt = (
        select(Member.status, func.count())
        .group_by(Member.status)
    )
    result = await db.execute(stmt)
    return {row[0]: row[1] for row in result.all()}


@router.get("/payment-methods")
async def payment_methods_report(db: AsyncSession = Depends(get_tenant_db_from_token)):
    today = date.today()
    month_start = today.replace(day=1)
    month_start_dt = datetime.combine(month_start, datetime.min.time())
    stmt = (
        select(Payment.method, func.coalesce(func.sum(Payment.amount), Decimal("0")))
        .where(
            Payment.created_at >= month_start_dt,
            Payment.status == PaymentStatus.paid,
        )
        .group_by(Payment.method)
    )
    result = await db.execute(stmt)
    return {row[0] or "unknown": float(row[1]) for row in result.all()}


@router.get("/attendance-today")
async def attendance_today_report(db: AsyncSession = Depends(get_tenant_db_from_token)):
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = today_start + timedelta(days=1)
    stmt = (
        select(func.count())
        .select_from(CheckIn)
        .where(CheckIn.created_at >= today_start, CheckIn.created_at < today_end)
    )
    result = await db.execute(stmt)
    total = result.scalar() or 0
    return {"total_checkins": total, "date": today.isoformat()}


@router.get("/expiring-memberships")
async def expiring_memberships_report(
    days: int = 7,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    today = date.today()
    cutoff = today + timedelta(days=days)
    stmt = (
        select(Membership, Member.full_name)
        .join(Member, Member.id == Membership.member_id)
        .where(
            Membership.end_date <= cutoff,
            Membership.end_date >= today,
            Membership.status == MembershipStatus.active,
        )
        .order_by(Membership.end_date)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "id": str(m.id),
            "member_id": str(m.member_id),
            "member_name": full_name,
            "plan_name": m.plan_name,
            "end_date": m.end_date.isoformat(),
            "days_remaining": (m.end_date - today).days,
        }
        for m, full_name in rows
    ]


@router.get("/revenue-history")
async def revenue_history_report(
    months: int = 6,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Monthly revenue for the last N months."""
    from sqlalchemy import case
    today = date.today()
    results = []
    for i in range(months - 1, -1, -1):
        target = date(today.year, today.month, 1)
        # go back i months
        month_date = date(target.year - (i // 12), target.month - (i % 12) or 12, 1) if (target.month - i % 12) <= 0 else date(target.year, target.month - i % 12, 1)
        # Simpler: subtract months
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        month_start = date(y, m, 1)
        if m == 12:
            month_end = date(y + 1, 1, 1)
        else:
            month_end = date(y, m + 1, 1)
        month_start_dt = datetime.combine(month_start, datetime.min.time())
        month_end_dt = datetime.combine(month_end, datetime.min.time())
        stmt = (
            select(func.coalesce(func.sum(Payment.amount), Decimal("0")))
            .where(
                Payment.created_at >= month_start_dt,
                Payment.created_at < month_end_dt,
                Payment.status == PaymentStatus.paid,
            )
        )
        row = await db.execute(stmt)
        total = row.scalar() or Decimal("0")
        results.append({
            "month": month_start.strftime("%b %Y"),
            "amount": float(total),
        })
    return results


@router.get("/inactive-members")
async def inactive_members_report(
    days: int = Query(14, ge=1, le=365, description="Días sin visita"),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Active members who haven't checked in for the last N days."""
    today = date.today()
    cutoff = datetime.combine(today - timedelta(days=days), datetime.min.time())

    # Subquery: member_ids that have a check-in after cutoff
    recent_checkins = (
        select(CheckIn.member_id)
        .where(CheckIn.created_at >= cutoff)
        .distinct()
        .scalar_subquery()
    )

    # Active members not in recent check-ins
    stmt = (
        select(Member)
        .where(
            Member.status == MemberStatus.active,
            Member.id.not_in(recent_checkins),
        )
        .order_by(Member.full_name)
        .limit(50)
    )
    result = await db.execute(stmt)
    members = result.scalars().all()

    # For each, get their last check-in date
    member_ids = [m.id for m in members]
    last_checkin_map: dict = {}
    if member_ids:
        last_stmt = (
            select(CheckIn.member_id, func.max(CheckIn.created_at).label("last_checkin"))
            .where(CheckIn.member_id.in_(member_ids))
            .group_by(CheckIn.member_id)
        )
        lr = await db.execute(last_stmt)
        for row in lr.all():
            last_checkin_map[row[0]] = row[1]

    return [
        {
            "id": str(m.id),
            "full_name": m.full_name,
            "email": m.email,
            "phone": m.phone,
            "last_checkin": last_checkin_map.get(m.id).isoformat() if last_checkin_map.get(m.id) else None,
            "days_inactive": (today - last_checkin_map[m.id].date()).days if last_checkin_map.get(m.id) else None,
        }
        for m in members
    ]


@router.get("/birthdays")
async def birthdays_report(
    months_ahead: int = Query(1, ge=1, le=3, description="Meses hacia adelante"),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Members with birthdays in the next N months (by day/month, ignoring year)."""
    today = date.today()
    results = []
    # Check across the next `months_ahead` months
    for offset in range(months_ahead * 31 + 1):
        check_date = today + timedelta(days=offset)
        stmt = (
            select(Member)
            .where(
                Member.birth_date.is_not(None),
                Member.status == MemberStatus.active,
                extract("month", Member.birth_date) == check_date.month,
                extract("day", Member.birth_date) == check_date.day,
            )
        )
        result = await db.execute(stmt)
        members = result.scalars().all()
        for m in members:
            days_until = offset
            results.append({
                "id": str(m.id),
                "full_name": m.full_name,
                "email": m.email,
                "phone": m.phone,
                "birth_date": m.birth_date.isoformat() if m.birth_date else None,
                "days_until": days_until,
            })
    # Deduplicate (a member might match twice in multi-month windows)
    seen = set()
    unique = []
    for r in results:
        if r["id"] not in seen:
            seen.add(r["id"])
            unique.append(r)
    # Sort by days_until
    unique.sort(key=lambda x: x["days_until"])
    return unique[:50]


@router.post("/generate-expiry-notifications")
async def generate_expiry_notifications(
    days: int = Query(7, ge=1, le=30, description="Notificar membresías que vencen en N días"),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Create notifications for memberships expiring in N days (idempotent — dedup by title)."""
    from app.models.tenant.notification import Notification
    today = date.today()
    cutoff = today + timedelta(days=days)

    stmt = (
        select(Membership, Member.full_name, Member.id.label("member_id"))
        .join(Member, Member.id == Membership.member_id)
        .where(
            Membership.end_date <= cutoff,
            Membership.end_date >= today,
            Membership.status == MembershipStatus.active,
        )
        .order_by(Membership.end_date)
    )
    result = await db.execute(stmt)
    rows = result.all()

    created = 0
    for membership, full_name, member_id in rows:
        days_left = (membership.end_date - today).days
        title = f"Membresía por vencer: {full_name}"
        # Dedup: skip if there's already an unread notification with this exact title today
        existing = await db.execute(
            select(Notification).where(
                Notification.title == title,
                Notification.is_read == False,
            )
        )
        if existing.scalar_one_or_none():
            continue

        msg = (
            f"La membresía '{membership.plan_name}' de {full_name} vence "
            f"{'hoy' if days_left == 0 else 'mañana' if days_left == 1 else f'en {days_left} días'} "
            f"({membership.end_date.isoformat()})."
        )
        notification = Notification(
            title=title,
            message=msg,
            type="warning",
            is_read=False,
        )
        db.add(notification)
        created += 1

    if created:
        await db.commit()

    return {"created": created, "total_expiring": len(rows)}
