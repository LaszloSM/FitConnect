import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Index, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase


class NotificationOutbox(TenantBase):
    """Cola de notificaciones salientes (WhatsApp / in-app).
    idempotency_key evita duplicados (ej. mismo recordatorio de vencimiento)."""
    __tablename__ = "notification_outbox"
    # El job toma los pendientes vencidos ordenados por fecha; sin índice es un
    # seq scan sobre toda la cola en cada corrida (cada minuto).
    __table_args__ = (Index("ix_notification_outbox_status", "status", "scheduled_for"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    channel: Mapped[str] = mapped_column(String(15), nullable=False)  # whatsapp | in_app
    recipient_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    member_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    template_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    template_params: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # pending | sent | failed | skipped
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
