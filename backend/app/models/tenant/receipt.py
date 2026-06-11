import uuid
from datetime import datetime
from sqlalchemy import Integer, ForeignKey, DateTime, Sequence, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from app.db.tenant_base import TenantBase

# Secuencia por-tenant (cada gym tiene su propia DB): consecutivo atómico de recibos.
# Ligada a la metadata para que create_all la cree en tenants nuevos.
receipt_number_seq = Sequence("receipt_number_seq", start=1, metadata=TenantBase.metadata)


class Receipt(TenantBase):
    """Comprobante de pago con consecutivo. snapshot es inmutable."""
    __tablename__ = "receipts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id"), unique=True, nullable=False)
    number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
