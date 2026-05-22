from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, extract
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token
from app.schemas.member import DashboardOverview, DashboardKPIs, MemberGrowthPoint, RevenuePoint
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.payment import Payment, PaymentStatus
from app.models.tenant.checkin import CheckIn
from app.models.tenant.membership import Membership, MembershipStatus

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

    # Payments in date range
    payments_month_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0")))
        .where(
            Payment.created_at >= start_dt,
            Payment.created_at < end_dt,
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
            Membership.status == MembershipStatus.active,
        )
    )
    expiring_memberships_7d = expiring_result.scalar() or 0

    kpis = DashboardKPIs(
        total_members=total_members,
        active_members=active_members,
        inactive_members=inactive_members,
        new_members_this_month=new_members_this_month,
        total_payments_month=total_payments_month,
        pending_payments_month=pending_payments_month,
        checkins_today=checkins_today,
        expiring_memberships_7d=expiring_memberships_7d,
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
