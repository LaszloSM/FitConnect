import uuid
from typing import Optional

from sqlalchemy import String, Boolean, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MessageTemplate(TenantBase, TenantTimestampMixin):
    """Mensaje editable por el dueño para cada ocasión (vencimiento, bienvenida,
    cumpleaños...). El cuerpo usa variables tipo {nombre}, {plan}, {fecha}, {link}.

    Para WhatsApp proactivo, el texto se envía a Meta para aprobación: meta_status
    refleja ese ciclo (draft -> pending -> approved/rejected) y meta_template_name
    guarda el nombre de la plantilla aprobada que usa el envío real."""
    __tablename__ = "message_templates"
    __table_args__ = (UniqueConstraint("occasion", name="uq_message_template_occasion"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occasion: Mapped[str] = mapped_column(String(50), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), default="whatsapp", nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    header_image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    meta_template_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    meta_status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
