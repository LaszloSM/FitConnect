from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
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
async def expiring_memberships_report(db: AsyncSession = Depends(get_tenant_db_from_token)):
    today = date.today()
    seven_days = today + timedelta(days=7)
    stmt = (
        select(Membership)
        .where(
            Membership.end_date <= seven_days,
            Membership.end_date >= today,
            Membership.status == MembershipStatus.active,
        )
        .order_by(Membership.end_date)
    )
    result = await db.execute(stmt)
    memberships = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "member_id": str(m.member_id),
            "plan_name": m.plan_name,
            "end_date": m.end_date.isoformat(),
            "days_remaining": (m.end_date - today).days,
        }
        for m in memberships
    ]
