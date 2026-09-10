import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.api.deps import get_tenant_db_from_token, get_current_staff, require_perm
from app.core import permissions as perm
from app.core.timeutil import now_bogota
from app.models.tenant.cash_shift import CashShift
from app.models.tenant.expense import Expense
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit

router = APIRouter(prefix="/cash", tags=["cash"])

_EXPENSE_CATEGORIES = {"servicios", "nomina", "insumos", "devolucion", "otros"}


class OpenShiftRequest(BaseModel):
    opening_amount: Decimal = Field(ge=0)
    location_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=500)


class CloseShiftRequest(BaseModel):
    counted_cash: Decimal = Field(ge=0)
    notes: str | None = Field(default=None, max_length=500)


class ExpenseCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    category: str
    concept: str = Field(min_length=1, max_length=255)
    method: str = Field(default="cash", pattern="^(cash|transfer)$")


async def _current_open_shift(db: AsyncSession, location_id: uuid.UUID | None) -> CashShift | None:
    stmt = select(CashShift).where(CashShift.status == "open")
    if location_id is None:
        stmt = stmt.where(CashShift.location_id.is_(None))
    else:
        stmt = stmt.where(CashShift.location_id == location_id)
    return (await db.execute(stmt.limit(1))).scalar_one_or_none()


async def _shift_cash_movements(db: AsyncSession, shift_id: uuid.UUID) -> tuple[Decimal, Decimal]:
    """(ingresos cash pagados del turno, egresos cash del turno)."""
    income = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.shift_id == shift_id,
            Payment.method == PaymentMethod.cash,
            Payment.status == PaymentStatus.paid,
        )
    )).scalar() or Decimal(0)
    outflow = (await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.shift_id == shift_id,
            Expense.method == "cash",
        )
    )).scalar() or Decimal(0)
    return Decimal(income), Decimal(outflow)


@router.get("/shifts/current", dependencies=[Depends(get_current_staff)])
async def current_shift(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    location_id: uuid.UUID | None = Query(None),
):
    from app.services.gym_settings import get_gym_settings

    gym = await get_gym_settings(db)
    shift = await _current_open_shift(db, location_id)
    if not shift:
        return {"open": False, "cash_shifts_enabled": gym.cash_shifts_enabled}
    income, outflow = await _shift_cash_movements(db, shift.id)
    return {
        "open": True,
        "cash_shifts_enabled": gym.cash_shifts_enabled,
        "shift": shift,
        "cash_income": str(income),
        "cash_expenses": str(outflow),
        "expected_cash": str(shift.opening_amount + income - outflow),
    }


@router.get("/shifts", dependencies=[Depends(require_perm(perm.CASH_READ))])
async def list_shifts(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    rows = (await db.execute(
        select(CashShift).order_by(desc(CashShift.opened_at)).limit(limit).offset(offset)
    )).scalars().all()
    return rows


@router.post("/shifts/open", status_code=201, dependencies=[Depends(require_perm(perm.CASH_OPEN))])
async def open_shift(
    payload: OpenShiftRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    if await _current_open_shift(db, payload.location_id):
        raise HTTPException(status_code=400, detail="Ya hay un turno de caja abierto en esta sede")
    shift = CashShift(
        opened_by=current_user.id,
        opened_at=now_bogota(),
        opening_amount=payload.opening_amount,
        location_id=payload.location_id,
        notes=payload.notes,
        status="open",
    )
    db.add(shift)
    audit(db, current_user, "cash.open", "cash_shift", shift.id, {"opening_amount": str(payload.opening_amount)})
    await db.commit()
    await db.refresh(shift)
    return shift


@router.post("/shifts/{shift_id}/close", dependencies=[Depends(require_perm(perm.CASH_CLOSE))])
async def close_shift(
    shift_id: uuid.UUID,
    payload: CloseShiftRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    shift = (await db.execute(
        select(CashShift).where(CashShift.id == shift_id)
    )).scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if shift.status == "closed":
        raise HTTPException(status_code=400, detail="El turno ya está cerrado")

    income, outflow = await _shift_cash_movements(db, shift.id)
    expected = shift.opening_amount + income - outflow
    shift.expected_cash = expected
    shift.counted_cash = payload.counted_cash
    shift.difference = payload.counted_cash - expected
    shift.closed_by = current_user.id
    shift.closed_at = now_bogota()
    shift.status = "closed"
    if payload.notes:
        shift.notes = payload.notes
    audit(db, current_user, "cash.close", "cash_shift", shift.id, {
        "expected": str(expected),
        "counted": str(payload.counted_cash),
        "difference": str(shift.difference),
    })
    await db.commit()
    await db.refresh(shift)
    return shift


@router.get("/expenses", dependencies=[Depends(require_perm(perm.CASH_READ))])
async def list_expenses(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    shift_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
):
    stmt = select(Expense).order_by(desc(Expense.created_at)).limit(limit)
    if shift_id:
        stmt = stmt.where(Expense.shift_id == shift_id)
    return (await db.execute(stmt)).scalars().all()


@router.post("/expenses", status_code=201, dependencies=[Depends(require_perm(perm.CASH_EXPENSE))])
async def create_expense(
    payload: ExpenseCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    if payload.category not in _EXPENSE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Categoría inválida. Válidas: {', '.join(sorted(_EXPENSE_CATEGORIES))}")
    # Asociar al turno abierto (sede única) si existe
    shift = await _current_open_shift(db, None)
    expense = Expense(
        shift_id=shift.id if shift else None,
        amount=payload.amount,
        category=payload.category,
        concept=payload.concept,
        method=payload.method,
        created_by=current_user.id,
    )
    db.add(expense)
    audit(db, current_user, "expense.create", "expense", expense.id, {
        "amount": str(payload.amount), "category": payload.category, "concept": payload.concept,
    })
    await db.commit()
    await db.refresh(expense)
    return expense
