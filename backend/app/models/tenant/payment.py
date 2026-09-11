import uuid
import enum
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, ForeignKey, Enum as SAEnum, Numeric, DateTime, Index, Sequence, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    transfer = "transfer"
    card = "card"
    wompi = "wompi"


class PaymentStatus(str, enum.Enum):
    paid = "paid"
    pending = "pending"
    failed = "failed"            # rechazado por la pasarela
    voided = "voided"            # anulado a mano: un pendiente que nunca entró
    refunded = "refunded"        # devuelto por completo


class PaymentKind(str, enum.Enum):
    """Fuente del ingreso. Texto, no enum nativo: las tenant DBs alineadas por
    create_all no necesitan ALTER TYPE cuando aparezca una fuente nueva."""
    membership = "membership"
    day_pass = "day_pass"
    product = "product"
    other = "other"


# Consecutivo corto de referencia de transferencia (el socio lo escribe en la
# descripción del giro). Por tenant; ligada a la metadata para create_all.
transfer_ref_seq = Sequence("transfer_ref_seq", start=1, metadata=TenantBase.metadata)


class Payment(TenantBase, TenantTimestampMixin):
    """Pagos manuales registrados por el staff del gym."""
    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_kind_created", "kind", "created_at"),
        Index(
            "uq_payments_transfer_reference",
            "transfer_reference",
            unique=True,
            postgresql_where=text("transfer_reference IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Nullable: una venta de mostrador a un no-miembro (walk-in) no tiene miembro.
    member_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=True, index=True)
    membership_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("memberships.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[Optional[PaymentMethod]] = mapped_column(SAEnum(PaymentMethod), nullable=True)
    status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus), default=PaymentStatus.pending, nullable=False)
    concept: Mapped[str] = mapped_column(String(500), nullable=False)
    external_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    shift_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("cash_shifts.id"), nullable=True, index=True)
    received_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default=PaymentKind.other.value, server_default="other",
    )
    # Transferencias: cuenta destino (id del objeto en gym_settings.transfer_accounts),
    # referencia corta y comprobante que adjunta el staff
    destination_account_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    transfer_reference: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    proof_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    proof_uploaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Datáfono: número de aprobación del voucher y qué terminal
    card_approval_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    card_terminal: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    discount_note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Devolución (paid → refunded) y anulación (pending → failed) con motivo
    refunded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    refund_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    refunded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    refund_expense_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("expenses.id"), nullable=True)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    void_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    voided_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Proyección del libro de movimientos (payment_movements): cuánto se devolvió
    # o corrigió. `amount` sigue siendo lo que se cobró.
    refunded_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
