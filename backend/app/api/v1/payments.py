import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import date
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token
from app.schemas.member import PaymentCreate, PaymentUpdate, PaymentResponse
from app.models.tenant.payment import Payment, PaymentStatus

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=list[PaymentResponse])
async def list_payments(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    member_id: uuid.UUID | None = Query(None),
    status: PaymentStatus | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(Payment)
    if member_id:
        stmt = stmt.where(Payment.member_id == member_id)
    if status:
        stmt = stmt.where(Payment.status == status)
    stmt = stmt.order_by(desc(Payment.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PaymentResponse, status_code=201)
async def create_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    payment = Payment(**payload.model_dump())
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


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
