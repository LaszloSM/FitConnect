from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, extract
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token
from app.core.timeutil import today_bogota, utc_day_bounds
from app.schemas.member import DashboardOverview, DashboardKPIs, MemberGrowthPoint, RevenuePoint
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.payment import Payment, PaymentStatus
from app.models.tenant.checkin import CheckIn
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.machine import Machine, MachineStatus
from app.services.gym_settings import get_gym_settings

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/kpis", response_model=DashboardOverview)
async def get_dashboard_kpis(
    from_: date | None = Query(None, alias="from"),
    to_: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = today_start + timedelta(days=1)
    month_start = today.replace(day=1)
    month_start_dt = datetime.combine(month_start, datetime.min.time())
    seven_days_later = today + timedelta(days=7)

    # Date range for KPI filtering
    start = from_ or date(today.year, today.month, 1)
    end = to_ or today
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.min.time()) + timedelta(days=1)

    # Total members
    total_members_result = await db.execute(select(func.count()).select_from(Member))
    total_members = total_members_result.scalar() or 0

    # Active / inactive
    active_members_result = await db.execute(
        select(func.count()).select_from(Member).where(Member.status == MemberStatus.active)
    )
    active_members = active_members_result.scalar() or 0
    inactive_members = total_members - active_members

    # New members in date range
    new_members_result = await db.execute(
        select(func.count()).select_from(Member).where(
            Member.created_at >= start_dt,
            Member.created_at < end_dt,
        )
    )
    new_members_this_month = new_members_result.scalar() or 0

    # Payments in date range — solo pagos efectivamente pagados (consistente con
    # revenue_history y con la caja). Lo pendiente se reporta aparte.
    payments_month_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0")))
        .where(
            Payment.created_at >= start_dt,
            Payment.created_at < end_dt,
            Payment.status == PaymentStatus.paid,
        )
    )
    total_payments_month = payments_month_result.scalar() or Decimal("0")

    pending_payments_month_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0")))
        .where(
            Payment.created_at >= start_dt,
            Payment.created_at < end_dt,
            Payment.status == PaymentStatus.pending,
        )
    )
    pending_payments_month = pending_payments_month_result.scalar() or Decimal("0")

    # Check-ins today
    checkins_today_result = await db.execute(
        select(func.count()).select_from(CheckIn).where(
            CheckIn.created_at >= today_start,
            CheckIn.created_at < today_end,
        )
    )
    checkins_today = checkins_today_result.scalar() or 0

    # Expiring memberships in 7 days
    expiring_result = await db.execute(
        select(func.count()).select_from(Membership).where(
            Membership.end_date <= seven_days_later,
            Membership.end_date >= today,
            Membership.status == MembershipStatus.active.value,
        )
    )
    expiring_memberships_7d = expiring_result.scalar() or 0

    # Machine health counts
    machines_total_result = await db.execute(select(func.count()).select_from(Machine))
    machines_total = machines_total_result.scalar() or 0

    machines_active_result = await db.execute(
        select(func.count()).select_from(Machine).where(Machine.status == MachineStatus.active)
    )
    machines_active = machines_active_result.scalar() or 0

    machines_maintenance_result = await db.execute(
        select(func.count()).select_from(Machine).where(
            Machine.status.in_([MachineStatus.maintenance, MachineStatus.damaged])
        )
    )
    machines_maintenance = machines_maintenance_result.scalar() or 0

    kpis = DashboardKPIs(
        total_members=total_members,
        active_members=active_members,
        inactive_members=inactive_members,
        new_members_this_month=new_members_this_month,
        total_payments_month=total_payments_month,
        pending_payments_month=pending_payments_month,
        checkins_today=checkins_today,
        expiring_memberships_7d=expiring_memberships_7d,
        machines_total=machines_total,
        machines_active=machines_active,
        machines_maintenance=machines_maintenance,
    )

    # Helper to get month start/end
    def get_month_range(months_ago: int):
        end = today.replace(day=1)
        for _ in range(months_ago):
            end = (end - timedelta(days=1)).replace(day=1)
        start = end
        next_month = (start + timedelta(days=32)).replace(day=1)
        return start, next_month

    # Member growth by month (last 6 months)
    member_growth = []
    for i in range(5, -1, -1):
        start, end = get_month_range(i)
        month_label = start.strftime("%Y-%m")
        start_dt = datetime.combine(start, datetime.min.time())
        end_dt = datetime.combine(end, datetime.min.time())
        count_result = await db.execute(
            select(func.count()).select_from(Member).where(
                Member.created_at >= start_dt,
                Member.created_at < end_dt,
            )
        )
        member_growth.append(MemberGrowthPoint(month=month_label, count=count_result.scalar() or 0))

    # Revenue history by month (last 6 months)
    revenue_history = []
    for i in range(5, -1, -1):
        start, end = get_month_range(i)
        month_label = start.strftime("%Y-%m")
        start_dt = datetime.combine(start, datetime.min.time())
        end_dt = datetime.combine(end, datetime.min.time())
        amount_result = await db.execute(
            select(func.coalesce(func.sum(Payment.amount), Decimal("0")))
            .where(
                Payment.created_at >= start_dt,
                Payment.created_at < end_dt,
                Payment.status == PaymentStatus.paid,
            )
        )
        revenue_history.append(RevenuePoint(month=month_label, amount=amount_result.scalar() or Decimal("0")))

    return DashboardOverview(
        kpis=kpis,
        member_growth=member_growth,
        revenue_history=revenue_history,
    )


@router.get("/operations")
async def get_operations_dashboard(
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Tablero del día a día de recepción: quién vence, morosos en gracia,
    accesos denegados de hoy. Pensado para accionar (cobrar / autorizar)."""
    gym = await get_gym_settings(db)
    today = today_bogota()
    week_end = today + timedelta(days=7)

    # Membresías que vencen hoy/esta semana (con teléfono para cobrar)
    expiring_rows = (await db.execute(
        select(Membership, Member.full_name, Member.phone, Member.id.label("member_id"))
        .join(Member, Member.id == Membership.member_id)
        .where(
            Membership.status == MembershipStatus.active.value,
            Membership.end_date >= today,
            Membership.end_date <= week_end,
        )
        .order_by(Membership.end_date)
    )).all()
    expiring = [
        {
            "membership_id": str(m.id),
            "member_id": str(member_id),
            "member_name": name,
            "phone": phone,
            "plan_name": m.plan_name,
            "end_date": m.end_date.isoformat(),
            "days_left": (m.end_date - today).days,
        }
        for m, name, phone, member_id in expiring_rows
    ]

    # Morosos dentro del período de gracia (vencidos pero aún pueden entrar)
    grace_rows = (await db.execute(
        select(Membership, Member.full_name, Member.phone, Member.id.label("member_id"))
        .join(Member, Member.id == Membership.member_id)
        .where(
            Membership.status == MembershipStatus.active.value,
            Membership.end_date < today,
            Membership.end_date >= today - timedelta(days=gym.grace_days),
        )
        .order_by(Membership.end_date)
    )).all() if gym.grace_days > 0 else []
    in_grace = [
        {
            "membership_id": str(m.id),
            "member_id": str(member_id),
            "member_name": name,
            "phone": phone,
            "plan_name": m.plan_name,
            "end_date": m.end_date.isoformat(),
            "days_overdue": (today - m.end_date).days,
        }
        for m, name, phone, member_id in grace_rows
    ]

    # Accesos denegados de hoy
    today_start, today_end = utc_day_bounds(today)
    denied_rows = (await db.execute(
        select(CheckIn, Member.full_name)
        .join(Member, Member.id == CheckIn.member_id)
        .where(
            CheckIn.created_at >= today_start,
            CheckIn.created_at < today_end,
            CheckIn.decision == "denied",
        )
        .order_by(CheckIn.created_at.desc())
    )).all()
    denied_today = [
        {
            "checkin_id": str(c.id),
            "member_id": str(c.member_id),
            "member_name": name,
            "reason": c.denial_reason,
            "at": c.created_at.isoformat(),
        }
        for c, name in denied_rows
    ]

    return {
        "expiring_this_week": expiring,
        "in_grace": in_grace,
        "denied_today": denied_today,
        "grace_days": gym.grace_days,
    }
