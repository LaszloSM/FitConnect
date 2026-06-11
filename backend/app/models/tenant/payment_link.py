import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, BigInteger, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class PaymentLink(TenantBase, TenantTimestampMixin):
    """Link de pago Wompi asociado a un Payment pendiente.
    membership_intent guarda qué membresía crear/renovar al confirmarse."""
    __tablename__ = "payment_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=False, index=True)
    wompi_link_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reference: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    amount_in_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checkout_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # created | paid | expired | voided
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    membership_intent: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)


class WebhookEvent(TenantBase):
    """Eventos de webhook recibidos — unique en event_id para idempotencia."""
    __tablename__ = "webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="wompi")
    event_id: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    transaction_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    raw: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
