"""Devolución de un pago confirmado: la plata sale (egreso de caja si fue
efectivo), el stock vuelve y el recibo original se conserva como evidencia."""
import uuid

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import utcnow_naive
from app.models.tenant.expense import Expense
from app.models.tenant.inventory import StockMovementType
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.payment_item import PaymentItem
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.inventory import apply_stock_movement
from app.services.payments import shift_for_cash, cancel_unpaid_membership, void_day_passes
from app.services.gym_settings import get_gym_settings

REFUND_EXPENSE_CATEGORY = "devolucion"


async def refund_payment(db: AsyncSession, user: UserStaff, payment: Payment, reason: str) -> Payment:
    if payment.status != PaymentStatus.paid:
        raise HTTPException(status_code=400, detail=f"Solo se devuelven pagos confirmados (está {payment.status.value})")

    gym = await get_gym_settings(db)
    # La plata sale por donde entró: en efectivo exige turno abierto (si el gym usa
    # turnos) para que cuadre la caja; otros medios dejan el egreso con su método
    shift = await shift_for_cash(db, gym) if payment.method == PaymentMethod.cash else None

    # Transición atómica paid→refunded: dos clics simultáneos no generan dos egresos
    result = await db.execute(
        update(Payment)
        .where(Payment.id == payment.id, Payment.status == PaymentStatus.paid)
        .values(
            status=PaymentStatus.refunded, refunded_at=utcnow_naive(),
            refund_reason=reason, refunded_by=user.id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=409, detail="Este pago ya fue devuelto")
    await db.refresh(payment)

    expense = Expense(
        shift_id=shift.id if shift else None,
        amount=payment.amount,
        category=REFUND_EXPENSE_CATEGORY,
        concept=f"Devolución {payment.concept}"[:255],
        method=payment.method.value if payment.method else "cash",
        created_by=user.id,
    )
    db.add(expense)
    await db.flush()
    payment.refund_expense_id = expense.id

    items = (await db.execute(
        select(PaymentItem).where(PaymentItem.payment_id == payment.id)
    )).scalars().all()
    for item in items:
        if item.product_id:
            await apply_stock_movement(
                db, item.product_id, StockMovementType.return_, item.quantity,
                note=f"Devolución de venta", payment_id=payment.id, user_id=user.id,
            )

    # Lo que el pago respaldaba deja de valer: pase del día y membresía sin otro pago
    await void_day_passes(db, payment.id, include_active=True)
    membership_cancelled = await cancel_unpaid_membership(db, payment)

    audit(db, user, "payment.refund", "payment", payment.id, {
        "amount": str(payment.amount), "method": payment.method.value if payment.method else None,
        "reason": reason, "items_returned": len([i for i in items if i.product_id]),
        "membership_cancelled": membership_cancelled,
    })
    return payment
