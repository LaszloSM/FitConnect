import uuid
import enum
from decimal import Decimal
from typing import Optional

from sqlalchemy import String, ForeignKey, Numeric, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MovementKind(str, enum.Enum):
    """Texto, no enum nativo: un tipo nuevo no debe exigir ALTER TYPE en las
    tenant DBs, que se bootstrapean con create_all."""
    charge = "charge"          # el cobro original
    void = "void"              # se anula un pendiente que nunca entró
    refund = "refund"          # la plata sale de verdad (egreso de caja)
    correction = "correction"  # error de digitación: ajusta el monto, NO mueve caja


class PaymentMovement(TenantBase, TenantTimestampMixin):
    """Libro de movimientos de un pago.

    El pago dejó de ser una fila que se muta: `PUT`/`DELETE` desaparecieron y
    toda corrección entra aquí. `Payment.amount` conserva lo que se cobró y
    `Payment.refunded_amount` es la proyección de este libro, recalculada en la
    misma transacción que inserta el movimiento (los reportes no pagan el costo
    de derivarlo en cada lectura).

    `amount` va con signo: positivo el cobro, negativo lo que se devuelve o
    corrige. La suma es siempre el saldo vivo del pago.
    """
    __tablename__ = "payment_movements"
    __table_args__ = (Index("ix_payment_movements_payment", "payment_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Snapshot del nombre: si la persona sale del gym, el libro sigue diciendo quién fue
    actor_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(255), nullable=False, default="sistema")
    shift_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("cash_shifts.id"), nullable=True)
    expense_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("expenses.id"), nullable=True)
