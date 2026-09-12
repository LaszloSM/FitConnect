"""Datasets de reportes por período. Los usan los endpoints JSON, los exports
PDF/Excel y el motor de señales, para que todos cuenten lo mismo."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import BOGOTA, today_bogota, utc_day_bounds, utcnow_naive
from app.models.tenant.checkin import CheckIn
from app.models.tenant.expense import Expense
from app.models.tenant.inventory import StockMovement
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.payment import Payment, PaymentStatus
from app.services.payment_ledger import net_amount
from app.models.tenant.payment_movement import MovementKind, PaymentMovement
from app.services.refunds import REFUND_EXPENSE_CATEGORY
from app.services.cash_catalog import EXPENSE_LABELS as CASH_EXPENSE_LABELS
from app.models.tenant.product import Product
from app.services import insights_engine as eng
from app.services.membership_status import effective_status

KIND_LABELS = {"membership": "Membresías", "day_pass": "Pases del día", "product": "Productos", "other": "Otros"}
METHOD_LABELS = {"cash": "Efectivo", "transfer": "Transferencia", "card": "Tarjeta", "wompi": "Wompi"}
EXPENSE_LABELS = CASH_EXPENSE_LABELS


MAX_PERIOD_DAYS = 366


def period_bounds(from_date: date | None, to_date: date | None) -> tuple[date, date, datetime, datetime]:
    """Rango de negocio [from, to] en fechas Bogotá. El fin se acota a hoy (los
    presets del front mandan fin de mes) y el rango a un año."""
    from fastapi import HTTPException
    today = today_bogota()
    start_day = from_date or today.replace(day=1)
    end_day = min(to_date or today, today)
    if end_day < start_day:
        end_day = start_day
    if (end_day - start_day).days > MAX_PERIOD_DAYS:
        raise HTTPException(status_code=422, detail="El período máximo es de un año")
    start, _ = utc_day_bounds(start_day)
    _, end = utc_day_bounds(end_day)
    return start_day, end_day, start, end


def _to_bogota(ts: datetime) -> datetime:
    return ts.replace(tzinfo=ZoneInfo("UTC")).astimezone(BOGOTA)


# ─── Ingresos ───

async def summary(db: AsyncSession, from_date: date | None, to_date: date | None) -> dict:
    start_day, end_day, start, end = period_bounds(from_date, to_date)
    paid = (await db.execute(
        select(func.coalesce(func.sum(net_amount()), 0), func.count())
        .where(Payment.status == PaymentStatus.paid, Payment.created_at >= start, Payment.created_at < end)
    )).one()
    pending = (await db.execute(
        select(func.coalesce(func.sum(net_amount()), 0), func.count())
        .where(Payment.status == PaymentStatus.pending, Payment.created_at >= start, Payment.created_at < end)
    )).one()
    # Lo devuelto se lee del libro de movimientos: `net_amount()` sobre un pago
    # devuelto da 0 por definición, y las devoluciones parciales ni siquiera
    # cambian el estado del pago.
    refunded = (await db.execute(
        select(func.coalesce(func.sum(-PaymentMovement.amount), 0))
        .where(
            PaymentMovement.kind == MovementKind.refund.value,
            PaymentMovement.created_at >= start, PaymentMovement.created_at < end,
        )
    )).scalar() or 0
    # Sin excluir la devolución, la utilidad la restaría dos veces: una en el
    # ingreso neto y otra como egreso.
    expenses = (await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.created_at >= start, Expense.created_at < end,
            Expense.category != REFUND_EXPENSE_CATEGORY,
        )
    )).scalar() or 0
    new_members = (await db.execute(
        select(func.count()).select_from(Member)
        .where(Member.created_at >= start, Member.created_at < end, Member.member_type == "member")
    )).scalar() or 0
    checkins = (await db.execute(
        select(func.count()).select_from(CheckIn)
        .where(CheckIn.created_at >= start, CheckIn.created_at < end, CheckIn.decision != "denied")
    )).scalar() or 0
    active_members = (await db.execute(
        select(func.count()).select_from(Member).where(Member.status == MemberStatus.active, Member.member_type == "member")
    )).scalar() or 0
    days = (end_day - start_day).days + 1
    return {
        "from": start_day.isoformat(), "to": end_day.isoformat(), "days": days,
        "revenue": float(paid[0]), "payments_count": paid[1],
        "pending": float(pending[0]), "pending_count": pending[1],
        "refunded": float(refunded), "expenses": float(expenses),
        "profit": float(paid[0]) - float(expenses),
        "new_members": new_members, "active_members": active_members,
        "checkins": checkins, "avg_daily_checkins": round(checkins / days, 1) if days else 0,
    }


async def revenue_daily(db: AsyncSession, from_date: date | None, to_date: date | None) -> list[dict]:
    start_day, end_day, start, end = period_bounds(from_date, to_date)
    rows = (await db.execute(
        select(Payment.created_at, Payment.amount - Payment.refunded_amount, Payment.kind)
        .where(Payment.status == PaymentStatus.paid, Payment.created_at >= start, Payment.created_at < end)
    )).all()
    by_day: dict[date, dict] = {}
    d = start_day
    while d <= end_day:
        by_day[d] = {"date": d.isoformat(), "amount": 0.0, "membership": 0.0, "day_pass": 0.0, "product": 0.0, "other": 0.0}
        d += timedelta(days=1)
    for ts, amount, kind in rows:
        day = _to_bogota(ts).date()
        if day in by_day:
            by_day[day]["amount"] += float(amount)
            by_day[day][kind or "other"] = by_day[day].get(kind or "other", 0.0) + float(amount)
    return list(by_day.values())


async def revenue_by_kind_and_method(db: AsyncSession, from_date: date | None, to_date: date | None) -> dict:
    _, _, start, end = period_bounds(from_date, to_date)
    rows = (await db.execute(
        select(Payment.kind, Payment.method, func.coalesce(func.sum(net_amount()), 0), func.count())
        .where(Payment.status == PaymentStatus.paid, Payment.created_at >= start, Payment.created_at < end)
        .group_by(Payment.kind, Payment.method)
    )).all()
    by_kind: dict = {}
    by_method: dict = {}
    total = 0.0
    for kind, method, amount, n in rows:
        k, m = kind or "other", (method.value if method else "unknown")
        e = by_kind.setdefault(k, {"label": KIND_LABELS.get(k, k), "amount": 0.0, "count": 0})
        e["amount"] += float(amount)
        e["count"] += n
        me = by_method.setdefault(m, {"label": METHOD_LABELS.get(m, m), "amount": 0.0, "count": 0})
        me["amount"] += float(amount)
        me["count"] += n
        total += float(amount)
    return {
        "total": total,
        "by_kind": [{"kind": k, **v} for k, v in by_kind.items()],
        "by_method": [{"method": m, **v} for m, v in by_method.items()],
    }


async def revenue_by_plan(db: AsyncSession, from_date: date | None, to_date: date | None) -> list[dict]:
    _, _, start, end = period_bounds(from_date, to_date)
    rows = (await db.execute(
        select(Membership.plan_name, func.coalesce(func.sum(net_amount()), 0), func.count())
        .join(Membership, Membership.id == Payment.membership_id)
        .where(Payment.status == PaymentStatus.paid, Payment.created_at >= start, Payment.created_at < end)
        .group_by(Membership.plan_name)
        .order_by(func.sum(net_amount()).desc())
    )).all()
    return [{"plan_name": p, "amount": float(a), "count": n} for p, a, n in rows]


async def expenses_by_category(db: AsyncSession, from_date: date | None, to_date: date | None) -> list[dict]:
    _, _, start, end = period_bounds(from_date, to_date)
    rows = (await db.execute(
        select(Expense.category, func.coalesce(func.sum(Expense.amount), 0), func.count())
        .where(Expense.created_at >= start, Expense.created_at < end)
        .group_by(Expense.category).order_by(func.sum(Expense.amount).desc())
    )).all()
    return [{"category": c, "label": EXPENSE_LABELS.get(c, c), "amount": float(a), "count": n} for c, a, n in rows]


PAYMENTS_LIST_LIMIT = 5000


async def payments_list(db: AsyncSession, from_date: date | None, to_date: date | None, limit: int = PAYMENTS_LIST_LIMIT) -> list[dict]:
    _, _, start, end = period_bounds(from_date, to_date)
    rows = (await db.execute(
        select(Payment, Member.full_name)
        .outerjoin(Member, Member.id == Payment.member_id)
        .where(Payment.created_at >= start, Payment.created_at < end)
        .order_by(Payment.created_at.desc()).limit(limit)
    )).all()
    return [
        {
            "date": _to_bogota(p.created_at).strftime("%d/%m/%Y %H:%M"),
            "member": name or "Mostrador",
            "concept": p.concept,
            "kind": KIND_LABELS.get(p.kind, p.kind),
            "method": METHOD_LABELS.get(p.method.value if p.method else "", "—"),
            "status": {
                "paid": "Pagado", "pending": "Pendiente", "failed": "Rechazado",
                "voided": "Anulado", "refunded": "Devuelto",
            }.get(p.status.value, p.status.value),
            "amount": float(p.amount),
            "reference": p.transfer_reference or p.card_approval_code or "",
        }
        for p, name in rows
    ]


# ─── Socios ───

async def members_overview(db: AsyncSession, from_date: date | None, to_date: date | None) -> dict:
    start_day, end_day, start, end = period_bounds(from_date, to_date)
    today = today_bogota()
    members = (await db.execute(select(Member).where(Member.member_type == "member"))).scalars().all()
    memberships = (await db.execute(select(Membership).where(Membership.status != MembershipStatus.cancelled.value))).scalars().all()
    from app.services.gym_settings import get_gym_settings
    gym = await get_gym_settings(db)
    best: dict = {}
    for m in memberships:
        st = effective_status(m, today=today, grace_days=gym.grace_days)
        rank = {"active": 5, "scheduled": 4, "frozen": 3, "in_grace": 2, "expired": 1}.get(st, 0)
        if m.member_id not in best or rank > best[m.member_id][0]:
            best[m.member_id] = (rank, st)
    status_counts = {"active": 0, "frozen": 0, "in_grace": 0, "expired": 0, "no_membership": 0, "scheduled": 0}
    for m in members:
        if m.status != MemberStatus.active:
            continue
        st = best.get(m.id, (0, "no_membership"))[1]
        status_counts[st] = status_counts.get(st, 0) + 1
    new_in_period = [m for m in members if start <= m.created_at < end]
    visitors = (await db.execute(
        select(func.count()).select_from(Member).where(Member.member_type == "visitor")
    )).scalar() or 0
    return {
        "from": start_day.isoformat(), "to": end_day.isoformat(),
        "total": len(members),
        "active_accounts": sum(1 for m in members if m.status == MemberStatus.active),
        "by_membership_status": status_counts,
        "new_in_period": len(new_in_period),
        "visitors": visitors,
        "new_list": [
            {"full_name": m.full_name, "phone": m.phone or "", "created_at": _to_bogota(m.created_at).strftime("%d/%m/%Y")}
            for m in sorted(new_in_period, key=lambda x: x.created_at, reverse=True)[:200]
        ],
    }


# ─── Asistencia ───

async def attendance(db: AsyncSession, from_date: date | None, to_date: date | None) -> dict:
    start_day, end_day, start, end = period_bounds(from_date, to_date)
    rows = (await db.execute(
        select(CheckIn.created_at, CheckIn.decision, CheckIn.source)
        .where(CheckIn.created_at >= start, CheckIn.created_at < end)
    )).all()
    allowed_times = [_to_bogota(ts) for ts, decision, _ in rows if decision != "denied"]
    denied = sum(1 for _, decision, _ in rows if decision == "denied")
    by_day: dict[date, int] = {}
    d = start_day
    while d <= end_day:
        by_day[d] = 0
        d += timedelta(days=1)
    for ts in allowed_times:
        if ts.date() in by_day:
            by_day[ts.date()] += 1
    by_source: dict[str, int] = {}
    for _, decision, source in rows:
        if decision != "denied":
            by_source[source or "reception"] = by_source.get(source or "reception", 0) + 1
    unique_members = (await db.execute(
        select(func.count(func.distinct(CheckIn.member_id)))
        .where(CheckIn.created_at >= start, CheckIn.created_at < end, CheckIn.decision != "denied")
    )).scalar() or 0
    peak = eng.peak_hours(allowed_times)
    return {
        "from": start_day.isoformat(), "to": end_day.isoformat(),
        "total": len(allowed_times), "denied": denied, "unique_members": unique_members,
        "daily": [{"date": k.isoformat(), "count": v} for k, v in by_day.items()],
        "by_source": [{"source": s, "count": n} for s, n in by_source.items()],
        "peak": peak,
    }


# ─── Inteligencia ───

async def forecast(db: AsyncSession) -> dict:
    today = today_bogota()
    month_start = today.replace(day=1)
    daily = await revenue_daily(db, month_start, today)
    mtd = sum(d["amount"] for d in daily)
    prev: list[float] = []
    for i in range(1, 4):
        m, y = today.month - i, today.year
        while m <= 0:
            m += 12
            y -= 1
        s = date(y, m, 1)
        e = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        s_utc, _ = utc_day_bounds(s)
        e_utc, _ = utc_day_bounds(e)
        total = (await db.execute(
            select(func.coalesce(func.sum(net_amount()), 0))
            .where(Payment.status == PaymentStatus.paid, Payment.created_at >= s_utc, Payment.created_at < e_utc)
        )).scalar() or 0
        prev.append(float(total))
    return eng.revenue_forecast(today, mtd, [d["amount"] for d in daily], prev)


async def churn_risk(db: AsyncSession, limit: int = 100) -> list[dict]:
    today = today_bogota()
    from app.services.gym_settings import get_gym_settings
    gym = await get_gym_settings(db)
    members = (await db.execute(
        select(Member).where(Member.status == MemberStatus.active, Member.member_type == "member")
    )).scalars().all()
    if not members:
        return []
    ids = [m.id for m in members]
    now = utcnow_naive()
    c30 = now - timedelta(days=30)
    c60 = now - timedelta(days=60)
    last_rows = (await db.execute(
        select(CheckIn.member_id, func.max(CheckIn.created_at), func.count())
        .where(CheckIn.member_id.in_(ids), CheckIn.decision != "denied")
        .group_by(CheckIn.member_id)
    )).all()
    last = {mid: ts for mid, ts, _ in last_rows}
    v30 = {mid: n for mid, n in (await db.execute(
        select(CheckIn.member_id, func.count()).where(CheckIn.member_id.in_(ids), CheckIn.decision != "denied", CheckIn.created_at >= c30).group_by(CheckIn.member_id)
    )).all()}
    v60 = {mid: n for mid, n in (await db.execute(
        select(CheckIn.member_id, func.count()).where(CheckIn.member_id.in_(ids), CheckIn.decision != "denied", CheckIn.created_at >= c60, CheckIn.created_at < c30).group_by(CheckIn.member_id)
    )).all()}
    memberships = (await db.execute(
        select(Membership).where(Membership.member_id.in_(ids), Membership.status != MembershipStatus.cancelled.value)
    )).scalars().all()
    by_member: dict = {}
    for m in memberships:
        by_member.setdefault(m.member_id, []).append(m)
    out = []
    for m in members:
        ms = sorted(by_member.get(m.id, []), key=lambda x: x.end_date, reverse=True)
        current = ms[0] if ms else None
        st = effective_status(current, today=today, grace_days=gym.grace_days) if current else "no_membership"
        days_overdue = max((today - current.end_date).days, 0) if current else 0
        last_ts = last.get(m.id)
        days_since = (today - _to_bogota(last_ts).date()).days if last_ts else None
        score, reasons = eng.churn_score(
            today=today, days_since_last_visit=days_since,
            visits_last_30=v30.get(m.id, 0), visits_prev_30=v60.get(m.id, 0),
            membership_end=current.end_date if current else None,
            membership_status=st, days_overdue=days_overdue,
            renewals_count=max(len(ms) - 1, 0),
        )
        if score < 35:
            continue
        out.append({
            "member_id": str(m.id), "full_name": m.full_name, "phone": m.phone,
            "score": score, "level": eng.churn_level(score), "reasons": reasons,
            "days_since_last_visit": days_since, "membership_status": st,
            "plan_name": current.plan_name if current else None,
            "end_date": current.end_date.isoformat() if current else None,
        })
    out.sort(key=lambda x: -x["score"])
    return out[:limit]


async def stockout(db: AsyncSession) -> list[dict]:
    today = today_bogota()
    cutoff = utcnow_naive() - timedelta(days=30)
    sold = {pid: int(-q) for pid, q in (await db.execute(
        select(StockMovement.product_id, func.coalesce(func.sum(StockMovement.quantity), 0))
        .where(StockMovement.type == "sale", StockMovement.created_at >= cutoff)
        .group_by(StockMovement.product_id)
    )).all()}
    products = (await db.execute(select(Product).where(Product.is_active.is_(True)))).scalars().all()
    out = []
    for p in products:
        eta = eng.stockout_eta(p.stock, sold.get(p.id, 0), today)
        out.append({
            "product_id": str(p.id), "name": p.name, "stock": p.stock,
            "low_stock_threshold": p.low_stock_threshold, "units_sold_30d": sold.get(p.id, 0), **eta,
        })
    out.sort(key=lambda x: (x["days_left"] is None, x["days_left"] if x["days_left"] is not None else 0))
    return out


async def cohorts(db: AsyncSession, months: int = 6) -> list[dict]:
    today = today_bogota()
    rows = (await db.execute(
        select(Membership.member_id, Membership.start_date, Membership.end_date)
        .where(Membership.status != MembershipStatus.cancelled.value)
    )).all()
    return eng.retention_cohorts(
        [{"member_id": mid, "start_date": s, "end_date": e} for mid, s, e in rows], today, months,
    )
