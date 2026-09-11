"""Libro de movimientos de un pago.

El pago dejó de ser una fila que se muta. `PUT /payments/{id}` permitía cambiar
monto y estado a mano sin dejar rastro, y `DELETE` borraba la fila físicamente:
entre los dos eran la puerta trasera de todo el modelo de reversa. Ahora toda
corrección entra como movimiento y `Payment` conserva lo que se cobró.

`Payment.refunded_amount` es la proyección del libro, recalculada en la misma
transacción que inserta el movimiento: los ~30 agregados de ingresos del repo no
pagan el costo de derivarla en cada lectura, solo cambian `sum(amount)` por
`sum(net_amount())`.
"""
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import utcnow_naive
from app.models.tenant.payment import Payment, PaymentStatus
from app.models.tenant.payment_movement import MovementKind, PaymentMovement
from app.models.tenant.user_staff import UserStaff

# Lo que realmente quedó en el gym: lo cobrado menos lo devuelto o corregido.
# Un pago sin reversas tiene refunded_amount = 0, así que el neto es el bruto.
def net_amount():
    return Payment.amount - Payment.refunded_amount


def outstanding(payment: Payment) -> Decimal:
    """Saldo vivo: lo que aún se puede devolver o corregir."""
    return Decimal(payment.amount) - Decimal(payment.refunded_amount or 0)


def record(
    db: AsyncSession,
    payment: Payment,
    *,
    kind: MovementKind,
    amount: Decimal,
    actor: UserStaff | None = None,
    reason: str | None = None,
    shift_id: uuid.UUID | None = None,
    expense_id: uuid.UUID | None = None,
) -> PaymentMovement:
    """Agrega un movimiento a la sesión (sin commit: viaja con la operación)."""
    movement = PaymentMovement(
        payment_id=payment.id,
        kind=kind.value,
        amount=amount,
        reason=reason,
        actor_staff_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "sistema",
        shift_id=shift_id,
        expense_id=expense_id,
    )
    db.add(movement)
    return movement


async def project(db: AsyncSession, payment: Payment) -> None:
    """Recalcula `refunded_amount` y el estado a partir del libro.

    Se llama tras insertar el movimiento, en la misma transacción. Un pago
    devuelto por completo pasa a `refunded`; con saldo vivo sigue `paid` (así
    los filtros de ingresos existentes lo siguen contando por su neto).
    """
    await db.flush()
    reversed_total = (await db.execute(
        select(func.coalesce(func.sum(-PaymentMovement.amount), 0)).where(
            PaymentMovement.payment_id == payment.id,
            PaymentMovement.amount < 0,
        )
    )).scalar() or Decimal("0")

    # El tope se aplica siempre: un pago anulado tiene un movimiento -amount en el
    # libro y sin tope `net_amount()` daría 0 (o negativo) en los agregados que sí
    # suman pagos no confirmados.
    payment.refunded_amount = min(Decimal(reversed_total), Decimal(payment.amount))
    if payment.status in (PaymentStatus.voided, PaymentStatus.failed, PaymentStatus.pending):
        return
    if payment.refunded_amount >= Decimal(payment.amount):
        payment.status = PaymentStatus.refunded
        payment.refunded_at = payment.refunded_at or utcnow_naive()
    else:
        payment.status = PaymentStatus.paid


async def movements_for(db: AsyncSession, payment_id: uuid.UUID) -> list[PaymentMovement]:
    return list((await db.execute(
        select(PaymentMovement)
        .where(PaymentMovement.payment_id == payment_id)
        .order_by(PaymentMovement.created_at)
    )).scalars().all())


async def backfill_charge(db: AsyncSession, payment: Payment, actor: UserStaff | None = None) -> None:
    """Movimiento de apertura del pago. Idempotente: los pagos anteriores al
    libro lo reciben la primera vez que alguien los toca."""
    exists = (await db.execute(
        select(PaymentMovement.id).where(
            PaymentMovement.payment_id == payment.id,
            PaymentMovement.kind == MovementKind.charge.value,
        ).limit(1)
    )).scalar_one_or_none()
    if exists:
        return
    record(db, payment, kind=MovementKind.charge, amount=Decimal(payment.amount),
           actor=actor, reason=payment.concept)
