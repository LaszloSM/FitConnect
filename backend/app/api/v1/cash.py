import uuid
from datetime import timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from app.services.idempotency import Idempotent
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.api.deps import get_tenant_db_from_token, get_current_staff, require_perm
from app.core import permissions as perm
from app.core.permissions import has_perm
from app.core.timeutil import now_bogota
from app.models.tenant.cash_shift import CashShift, CashDrop
from app.models.tenant.expense import Expense
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.services.cash_catalog import (
    DENOMINATION_KEYS,
    EXPENSE_LABELS,
    MANUAL_EXPENSE_CATEGORIES,
    denominations_total,
)
from app.services.payment_ledger import net_amount
from app.services.refunds import REFUND_EXPENSE_CATEGORY
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit

router = APIRouter(prefix="/cash", tags=["cash"])

METHOD_LABELS = {"cash": "Efectivo", "transfer": "Transferencia", "card": "Tarjeta", "wompi": "Wompi"}


class OpenShiftRequest(BaseModel):
    opening_amount: Decimal = Field(ge=0)
    location_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=500)


class CloseShiftRequest(BaseModel):
    counted_cash: Decimal | None = Field(default=None, ge=0)
    # {"50000": 3, "1000": 12}: el total sale del desglose.
    denominations: dict[str, int] | None = None
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _conteo(self):
        if self.denominations:
            invalidas = sorted(k for k in self.denominations if k not in DENOMINATION_KEYS)
            if invalidas:
                raise ValueError(f"Denominación inválida: {', '.join(invalidas)}")
            if any(q < 0 for q in self.denominations.values()):
                raise ValueError("Las cantidades del arqueo no pueden ser negativas")
            total = denominations_total(self.denominations)
            if self.counted_cash is not None and self.counted_cash != total:
                raise ValueError("El total contado no coincide con el desglose por denominación")
            self.counted_cash = total
        if self.counted_cash is None:
            raise ValueError("Indica el efectivo contado o el desglose por denominación")
        return self


class ExpenseCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    category: str
    concept: str = Field(min_length=1, max_length=255)
    method: str = Field(default="cash", pattern="^(cash|transfer)$")


class DropCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    note: str | None = Field(default=None, max_length=255)


async def _current_open_shift(db: AsyncSession, location_id: uuid.UUID | None) -> CashShift | None:
    stmt = select(CashShift).where(CashShift.status == "open")
    if location_id is None:
        stmt = stmt.where(CashShift.location_id.is_(None))
    else:
        stmt = stmt.where(CashShift.location_id == location_id)
    return (await db.execute(stmt.limit(1))).scalar_one_or_none()


async def _shift_cash_movements(db: AsyncSession, shift_id: uuid.UUID) -> tuple[Decimal, Decimal, Decimal]:
    """(ingresos cash pagados, egresos cash, retiros a bóveda) del turno."""
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
    drops = (await db.execute(
        select(func.coalesce(func.sum(CashDrop.amount), 0)).where(CashDrop.shift_id == shift_id)
    )).scalar() or Decimal(0)
    return Decimal(income), Decimal(outflow), Decimal(drops)


async def _staff_names(db: AsyncSession, ids) -> dict[uuid.UUID, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = (await db.execute(select(UserStaff.id, UserStaff.full_name).where(UserStaff.id.in_(ids)))).all()
    return {r.id: r.full_name for r in rows}


def _shift_out(shift: CashShift, names: dict[uuid.UUID, str]) -> dict:
    data = {attr.key: getattr(shift, attr.key) for attr in CashShift.__mapper__.column_attrs}
    data["opened_by_name"] = names.get(shift.opened_by)
    data["closed_by_name"] = names.get(shift.closed_by)
    return data


def _drop_out(drop: CashDrop) -> dict:
    return {
        "id": str(drop.id),
        "shift_id": str(drop.shift_id),
        "amount": str(drop.amount),
        "note": drop.note,
        "created_at": drop.created_at.isoformat() if drop.created_at else None,
    }


# Quien puede abrir o cerrar turno puede ver el que está abierto. Un
# entrenador no tiene nada que hacer mirando la caja del día.
@router.get("/shifts/current", dependencies=[Depends(require_perm(perm.CASH_OPEN))])
async def current_shift(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    location_id: uuid.UUID | None = Query(None),
):
    """El cierre es ciego para quien cuenta.

    Mostrarle al cajero "esperado en caja" antes de contar anula el control:
    sabe a qué cifra tiene que llegar. Solo quien supervisa la caja (`cash.read`)
    ve el esperado en vivo; el cajero lo conoce al cerrar, junto con la diferencia.
    """
    from app.services.gym_settings import get_gym_settings

    gym = await get_gym_settings(db)
    shift = await _current_open_shift(db, location_id)
    if not shift:
        return {"open": False, "cash_shifts_enabled": gym.cash_shifts_enabled}
    income, outflow, drops_total = await _shift_cash_movements(db, shift.id)
    drops = (await db.execute(
        select(CashDrop).where(CashDrop.shift_id == shift.id).order_by(CashDrop.created_at)
    )).scalars().all()
    supervisa = has_perm(current_user.role, perm.CASH_READ)
    names = await _staff_names(db, [shift.opened_by])
    return {
        "open": True,
        "cash_shifts_enabled": gym.cash_shifts_enabled,
        "blind": not supervisa,
        "shift": _shift_out(shift, names),
        "cash_income": str(income) if supervisa else None,
        "cash_expenses": str(outflow) if supervisa else None,
        "drops_total": str(drops_total),
        "drops": [_drop_out(d) for d in drops],
        "expected_cash": str(shift.opening_amount + income - outflow - drops_total) if supervisa else None,
    }


@router.get("/shifts/current/x-report", dependencies=[Depends(require_perm(perm.CASH_READ))])
async def x_report(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    location_id: uuid.UUID | None = Query(None),
):
    """Corte X: cómo va el turno sin cerrarlo.

    Es lo que permite un arqueo de supervisión o un relevo a mitad de jornada
    sin tener que cerrar y reabrir la caja.
    """
    shift = await _current_open_shift(db, location_id)
    if not shift:
        raise HTTPException(status_code=404, detail="No hay un turno de caja abierto")
    income, outflow, drops_total = await _shift_cash_movements(db, shift.id)

    # `created_at` es UTC naive; `opened_at` viene con zona.
    desde = shift.opened_at.astimezone(timezone.utc).replace(tzinfo=None)
    por_metodo = (await db.execute(
        select(Payment.method, func.count(), func.coalesce(func.sum(net_amount()), 0))
        .where(Payment.status == PaymentStatus.paid, Payment.created_at >= desde)
        .group_by(Payment.method)
    )).all()
    egresos = (await db.execute(
        select(Expense.category, func.count(), func.coalesce(func.sum(Expense.amount), 0))
        .where(
            Expense.shift_id == shift.id,
            Expense.method == "cash",
            Expense.category != REFUND_EXPENSE_CATEGORY,
        )
        .group_by(Expense.category)
    )).all()
    names = await _staff_names(db, [shift.opened_by])

    return {
        "shift_id": str(shift.id),
        "opened_at": shift.opened_at.isoformat(),
        "opened_by_name": names.get(shift.opened_by),
        "opening_amount": str(shift.opening_amount),
        "cash_income": str(income),
        "cash_expenses": str(outflow),
        "drops_total": str(drops_total),
        "expected_cash": str(shift.opening_amount + income - outflow - drops_total),
        "by_method": [
            {
                "method": m.value if hasattr(m, "value") else str(m),
                "label": METHOD_LABELS.get(m.value if hasattr(m, "value") else str(m), str(m)),
                "count": int(n),
                "amount": str(total),
            }
            for m, n, total in por_metodo
        ],
        "expenses": [
            {"category": c, "label": EXPENSE_LABELS.get(c, c), "count": int(n), "amount": str(total)}
            for c, n, total in egresos
        ],
        "generated_at": now_bogota().isoformat(),
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
    names = await _staff_names(db, [i for s in rows for i in (s.opened_by, s.closed_by)])
    return [_shift_out(s, names) for s in rows]


@router.get("/differences", dependencies=[Depends(require_perm(perm.CASH_READ))])
async def differences_by_cashier(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    days: int = Query(90, ge=7, le=366),
):
    """Diferencias de cierre agrupadas por quien cerró.

    Un faltante aislado es un error de conteo; el mismo cajero con faltantes
    tres semanas seguidas es otra conversación. Sin agrupar, el patrón no se ve.
    """
    desde = now_bogota() - timedelta(days=days)
    shifts = (await db.execute(
        select(CashShift).where(CashShift.status == "closed", CashShift.closed_at >= desde)
    )).scalars().all()
    names = await _staff_names(db, [s.closed_by for s in shifts])

    grupos: dict = {}
    for s in shifts:
        g = grupos.setdefault(s.closed_by, {
            "staff_id": str(s.closed_by) if s.closed_by else None,
            "name": names.get(s.closed_by) or "Sin registro",
            "shifts": 0,
            "with_difference": 0,
            "shortage": Decimal(0),
            "overage": Decimal(0),
            "last_closed_at": None,
        })
        g["shifts"] += 1
        diff = s.difference or Decimal(0)
        if diff != 0:
            g["with_difference"] += 1
        if diff < 0:
            g["shortage"] += -diff
        elif diff > 0:
            g["overage"] += diff
        if s.closed_at and (g["last_closed_at"] is None or s.closed_at > g["last_closed_at"]):
            g["last_closed_at"] = s.closed_at

    items = sorted(grupos.values(), key=lambda g: (-g["shortage"], g["name"]))
    return {
        "days": days,
        "items": [
            {
                **g,
                "shortage": str(g["shortage"]),
                "overage": str(g["overage"]),
                "net": str(g["overage"] - g["shortage"]),
                "last_closed_at": g["last_closed_at"].isoformat() if g["last_closed_at"] else None,
            }
            for g in items
        ],
    }


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

    income, outflow, drops = await _shift_cash_movements(db, shift.id)
    expected = shift.opening_amount + income - outflow - drops
    counted = payload.counted_cash
    shift.expected_cash = expected
    shift.counted_cash = counted
    shift.difference = counted - expected
    shift.denominations = {k: q for k, q in (payload.denominations or {}).items() if q} or None
    shift.closed_by = current_user.id
    shift.closed_at = now_bogota()
    shift.status = "closed"
    if payload.notes:
        shift.notes = payload.notes
    audit(db, current_user, "cash.close", "cash_shift", shift.id, {
        "expected": str(expected),
        "counted": str(counted),
        "difference": str(shift.difference),
        "drops": str(drops),
        "denominations": shift.denominations,
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
        "denominations": shift.denominations,
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
    })
    shift.status = "open"
    shift.closed_at = None
    shift.closed_by = None
    shift.counted_cash = None
    shift.expected_cash = None
    shift.difference = None
    shift.denominations = None
    await db.commit()
    await db.refresh(shift)
    return shift


@router.post("/shifts/{shift_id}/drops", status_code=201, dependencies=[Depends(require_perm(perm.CASH_CLOSE))])
async def create_drop(
    shift_id: uuid.UUID,
    payload: DropCreate,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    """Retiro a bóveda. No se valida contra el esperado: el cierre es ciego."""
    guard = Idempotent(db, request, "cash.drop", {"shift_id": str(shift_id), **payload.model_dump()})
    replay = await guard.check()
    if replay is not None:
        return replay

    shift = (await db.execute(
        select(CashShift).where(CashShift.id == shift_id)
    )).scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if shift.status != "open":
        raise HTTPException(status_code=400, detail="Solo se retira efectivo de un turno abierto")

    drop = CashDrop(shift_id=shift.id, amount=payload.amount, note=payload.note, created_by=current_user.id)
    db.add(drop)
    await db.flush()
    await db.refresh(drop)
    audit(db, current_user, "cash.drop", "cash_shift", shift.id, {
        "amount": str(payload.amount), "note": payload.note,
    })
    response = _drop_out(drop)
    guard.remember(response, 201)
    won = await guard.commit()
    return won if won is not None else response


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

    if payload.category == REFUND_EXPENSE_CATEGORY:
        raise HTTPException(
            status_code=400,
            detail="Las devoluciones se registran desde el pago (Historial › Devolver), no como egreso suelto",
        )
    if payload.category not in MANUAL_EXPENSE_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Categoría inválida. Válidas: {', '.join(sorted(MANUAL_EXPENSE_CATEGORIES))}",
        )
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
