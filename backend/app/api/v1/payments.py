import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token
from app.schemas.member import PaymentCreate, PaymentUpdate, PaymentResponse
from app.models.tenant.payment import Payment, PaymentStatus, PaymentMethod
from app.models.tenant.member import Member
from app.models.tenant.membership import Membership

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=list[PaymentResponse])
async def list_payments(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    member_id: uuid.UUID | None = Query(None),
    status: PaymentStatus | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(Payment)
    if member_id:
        stmt = stmt.where(Payment.member_id == member_id)
    if status:
        stmt = stmt.where(Payment.status == status)
    if from_date:
        stmt = stmt.where(Payment.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        stmt = stmt.where(Payment.created_at < datetime.combine(to_date, datetime.min.time()) + timedelta(days=1))
    stmt = stmt.order_by(desc(Payment.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PaymentResponse, status_code=201)
async def create_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    member_result = await db.execute(select(Member).where(Member.id == payload.member_id))
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    if payload.membership_id is not None:
        mem_result = await db.execute(
            select(Membership).where(Membership.id == payload.membership_id)
        )
        membership = mem_result.scalar_one_or_none()
        if not membership:
            raise HTTPException(status_code=404, detail="Membresía no encontrada")
        if membership.member_id != payload.member_id:
            raise HTTPException(
                status_code=400,
                detail="La membresía no pertenece a este miembro",
            )

    payment = Payment(**payload.model_dump())
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


@router.get("/cash")
async def cash_box(
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Caja: ingresos pagados de hoy y del mes, con desglose por método."""
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    async def _totals(since: datetime) -> dict:
        stmt = (
            select(Payment.method, func.coalesce(func.sum(Payment.amount), 0), func.count())
            .where(Payment.status == PaymentStatus.paid, Payment.created_at >= since)
            .group_by(Payment.method)
        )
        result = await db.execute(stmt)
        by_method: dict[str, float] = {}
        total = Decimal(0)
        count = 0
        for method, amount, n in result.all():
            key = method.value if method else "unknown"
            by_method[key] = float(amount)
            total += amount
            count += n
        return {"total": float(total), "count": count, "by_method": by_method}

    return {
        "today": await _totals(today_start),
        "month": await _totals(month_start),
    }


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return payment


@router.put("/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: uuid.UUID,
    payload: PaymentUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(payment, field, value)
    
    await db.commit()
    await db.refresh(payment)
    return payment


@router.delete("/{payment_id}", status_code=204)
async def delete_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    await db.delete(payment)
    await db.commit()
    return None


@router.patch("/{payment_id}/mark-paid", response_model=PaymentResponse)
async def mark_payment_paid(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Marcar un pago como pagado (estado: paid)."""
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if payment.status == PaymentStatus.paid:
        raise HTTPException(status_code=400, detail="El pago ya está marcado como pagado")
    payment.status = PaymentStatus.paid
    await db.commit()
    await db.refresh(payment)
    return payment
