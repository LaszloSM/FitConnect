import uuid
from typing import Optional

from sqlalchemy import String, Boolean, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MessageTemplate(TenantBase, TenantTimestampMixin):
    """Mensaje editable por el dueño para cada ocasión (vencimiento, bienvenida,
    cumpleaños...). El cuerpo usa variables tipo {nombre}, {plan}, {fecha}, {link}
    y gobierna la notificación in-app.

    `meta_template_name` es el nombre de la plantilla que el gym tiene aprobada
    en SU WhatsApp Business. No existe un ciclo de aprobación dentro de esta app:
    lo aprueba Meta. Antes había un `meta_status` (draft/pending/approved/
    rejected) que ningún código movía y que la UI pintaba como si fuera real."""
    __tablename__ = "message_templates"
    __table_args__ = (UniqueConstraint("occasion", name="uq_message_template_occasion"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occasion: Mapped[str] = mapped_column(String(50), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    meta_template_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
