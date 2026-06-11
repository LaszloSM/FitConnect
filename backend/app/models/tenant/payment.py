import uuid
import enum
from decimal import Decimal
from sqlalchemy import String, ForeignKey, Enum as SAEnum, Numeric
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
    failed = "failed"
    refunded = "refunded"


class Payment(TenantBase, TenantTimestampMixin):
    """Pagos manuales registrados por el staff del gym."""
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
    membership_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("memberships.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[Optional[PaymentMethod]] = mapped_column(SAEnum(PaymentMethod), nullable=True)
    status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus), default=PaymentStatus.pending, nullable=False)
    concept: Mapped[str] = mapped_column(String(500), nullable=False)
    external_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    shift_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("cash_shifts.id"), nullable=True, index=True)
    received_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
