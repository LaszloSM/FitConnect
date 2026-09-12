import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from app.services.idempotency import Idempotent
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.api.deps import get_tenant_db_from_token, get_current_staff, require_perm
from app.core import permissions as perm
from app.core.permissions import has_perm
from app.core.timeutil import now_bogota
from app.models.tenant.cash_shift import CashShift
from app.models.tenant.expense import Expense
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.services.payment_ledger import net_amount
from app.services.refunds import REFUND_EXPENSE_CATEGORY
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
        select(func.coalesce(func.sum(net_amount()), 0)).where(
            Payment.shift_id == shift_id,
            Payment.method == PaymentMethod.cash,
            Payment.status == PaymentStatus.paid,
        )
    )).scalar() or Decimal(0)
    # El ingreso ya viene NETO (net_amount resta lo devuelto), así que contar aquí
    # el egreso de la devolución restaría la misma plata dos veces y el cierre
    # mostraría un sobrante fantasma que acusa al cajero.
    outflow = (await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.shift_id == shift_id,
            Expense.method == "cash",
            Expense.category != REFUND_EXPENSE_CATEGORY,
        )
    )).scalar() or Decimal(0)
    return Decimal(income), Decimal(outflow)


# Quien puede abrir o cerrar turno puede ver el que está abierto. Un
# entrenador no tiene nada que hacer mirando la caja del día.
@router.get("/shifts/current", dependencies=[Depends(require_perm(perm.CASH_OPEN))])
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
    await db.flush()
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


class ReopenShiftRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


@router.post("/shifts/{shift_id}/reopen", dependencies=[Depends(require_perm(perm.CASH_REOPEN))])
async def reopen_shift(
    shift_id: uuid.UUID,
    payload: ReopenShiftRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    """Reabre un turno cerrado con un conteo errado.

    Un cierre quedaba fijo para siempre: la única salida a un error después de
    cerrar era borrar pagos, que es justo el camino sin rastro. Solo el dueño, y
    solo si no hay otro turno abierto (el efectivo nuevo iría al turno equivocado).
    """
    shift = (await db.execute(
        select(CashShift).where(CashShift.id == shift_id)
    )).scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if shift.status != "closed":
        raise HTTPException(status_code=400, detail="El turno no está cerrado")
    other = await _current_open_shift(db, shift.location_id)
    if other is not None:
        raise HTTPException(status_code=409, detail="Ya hay un turno abierto: ciérralo antes de reabrir este")

    audit(db, current_user, "cash.reopen", "cash_shift", shift.id, {
        "reason": payload.reason,
        "counted": str(shift.counted_cash) if shift.counted_cash is not None else None,
        "difference": str(shift.difference) if shift.difference is not None else None,
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
    })
    shift.status = "open"
    shift.closed_at = None
    shift.closed_by = None
    shift.counted_cash = None
    shift.expected_cash = None
    shift.difference = None
    await db.commit()
    await db.refresh(shift)
    return shift


@router.get("/expenses")
async def list_expenses(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    shift_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
):
    """Los egresos de UN turno los ve quien puede registrarlos; el histórico
    completo exige `cash.read`.

    Recepción podía crear egresos y no verlos: sin la lista de lo que sacó de la
    caja no hay forma de cuadrarla al cerrar.
    """
    puede_todo = has_perm(current_user.role, perm.CASH_READ)
    if not puede_todo:
        if shift_id is None or not has_perm(current_user.role, perm.CASH_EXPENSE):
            raise HTTPException(status_code=403, detail="Sin permisos suficientes")

    stmt = select(Expense).order_by(desc(Expense.created_at)).limit(limit)
    if shift_id:
        stmt = stmt.where(Expense.shift_id == shift_id)
    return (await db.execute(stmt)).scalars().all()


@router.post("/expenses", status_code=201, dependencies=[Depends(require_perm(perm.CASH_EXPENSE))])
async def create_expense(
    payload: ExpenseCreate,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    guard = Idempotent(db, request, "cash.expense", payload.model_dump())
    replay = await guard.check()
    if replay is not None:
        return replay

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
    await db.flush()
    response = {
        "id": str(expense.id),
        "shift_id": str(expense.shift_id) if expense.shift_id else None,
        "amount": str(expense.amount),
        "category": expense.category,
        "concept": expense.concept,
        "method": expense.method,
        "created_at": expense.created_at.isoformat() if expense.created_at else None,
    }
    guard.remember(response, 201)
    won = await guard.commit()
    return won if won is not None else response
