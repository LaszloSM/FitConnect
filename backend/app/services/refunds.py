"""Reversa de un pago confirmado.

Dos cosas que antes se confundían y ahora no:

- **Devolución**: la plata sale de verdad, así que genera un egreso de caja.
- **Corrección**: fue un error de digitación (se cobró 150.000 en vez de
  120.000). No sale plata, así que NO genera egreso. Antes la única salida era
  devolver el pago entero —descuadrando la caja del día para arreglar un typo—
  o borrarlo, que no dejaba rastro.

Y la reversa ya no es total obligatoriamente: se devuelve hasta el saldo vivo.
"""
import uuid
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.expense import Expense
from app.models.tenant.inventory import StockMovementType
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.payment_item import PaymentItem
from app.models.tenant.payment_movement import MovementKind
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.inventory import apply_stock_movement
from app.services.payment_ledger import backfill_charge, outstanding, project, record
from app.services.payments import shift_for_cash, cancel_unpaid_membership, void_day_passes
from app.services.gym_settings import get_gym_settings

REFUND_EXPENSE_CATEGORY = "devolucion"


async def reverse_payment(
    db: AsyncSession,
    user: UserStaff,
    payment: Payment,
    reason: str,
    *,
    amount: Decimal | None = None,
    kind: MovementKind = MovementKind.refund,
) -> Payment:
    if payment.status != PaymentStatus.paid:
        raise HTTPException(
            status_code=400,
            detail=f"Solo se revierten pagos confirmados (está {payment.status.value})",
        )
    if kind not in (MovementKind.refund, MovementKind.correction):
        raise HTTPException(status_code=400, detail="Tipo de reversa inválido")

    # Bloquear la fila: dos reversas concurrentes leían ambas saldo completo,
    # insertaban su movimiento y creaban su egreso, devolviendo más de lo cobrado.
    payment = (await db.execute(
        select(Payment).where(Payment.id == payment.id).with_for_update()
    )).scalar_one()
    if payment.status != PaymentStatus.paid:
        raise HTTPException(status_code=409, detail="Este pago ya fue revertido")

    await backfill_charge(db, payment)
    live = outstanding(payment)
    value = Decimal(amount) if amount is not None else live
    if value <= 0:
        raise HTTPException(status_code=400, detail="El monto a revertir debe ser mayor que cero")
    if value > live:
        raise HTTPException(
            status_code=400,
            detail=f"El monto supera el saldo vivo del pago ({live})",
        )
    full = value >= live

    shift = None
    expense_id = None
    if kind == MovementKind.refund:
        # La plata sale por donde entró: en efectivo exige turno abierto (si el gym
        # usa turnos) para que cuadre la caja; otros medios dejan el egreso con su método.
        gym = await get_gym_settings(db)
        shift = await shift_for_cash(db, gym) if payment.method == PaymentMethod.cash else None
        expense = Expense(
            shift_id=shift.id if shift else None,
            amount=value,
            category=REFUND_EXPENSE_CATEGORY,
            concept=f"Devolución {payment.concept}"[:255],
            method=payment.method.value if payment.method else "cash",
            created_by=user.id,
        )
        db.add(expense)
        await db.flush()
        expense_id = expense.id
        # Con varias parciales hay varios egresos; el vínculo real vive en
        # payment_movements.expense_id y este campo conserva el primero.
        payment.refund_expense_id = payment.refund_expense_id or expense.id

    record(
        db, payment, kind=kind, amount=-value, actor=user, reason=reason,
        shift_id=shift.id if shift else None, expense_id=expense_id,
    )
    await project(db, payment)

    items_returned = 0
    membership_cancelled = False
    if full:
        # Solo una reversa total deshace lo que el pago respaldaba: con saldo vivo
        # el socio conserva su acceso y el producto ya salió del inventario.
        payment.refund_reason = reason
        payment.refunded_by = user.id
        items = (await db.execute(
            select(PaymentItem).where(PaymentItem.payment_id == payment.id)
        )).scalars().all()
        for item in items:
            if item.product_id:
                await apply_stock_movement(
                    db, item.product_id, StockMovementType.return_, item.quantity,
                    note="Devolución de venta", payment_id=payment.id, user_id=user.id,
                )
                items_returned += 1
        await void_day_passes(db, payment.id, include_active=True)
        membership_cancelled = await cancel_unpaid_membership(db, payment)

    # Acción literal a propósito: tests/test_audit_actions.py cruza por texto lo
    # que el backend emite contra lo que la UI rotula, y un f-string lo invisibiliza.
    details = {
        "amount": str(value),
        "full": full,
        "method": payment.method.value if payment.method else None,
        "reason": reason,
        "items_returned": items_returned,
        "membership_cancelled": membership_cancelled,
        "expense_created": expense_id is not None,
    }
    if kind == MovementKind.refund:
        audit(db, user, "payment.refund", "payment", payment.id, details)
    else:
        audit(db, user, "payment.correction", "payment", payment.id, details)
    return payment


async def refund_payment(db: AsyncSession, user: UserStaff, payment: Payment, reason: str) -> Payment:
    """Devolución total, la firma que usaban los llamadores anteriores."""
    return await reverse_payment(db, user, payment, reason)
