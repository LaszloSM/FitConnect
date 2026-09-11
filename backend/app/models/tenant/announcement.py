import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class Announcement(TenantBase, TenantTimestampMixin):
    """Mensaje que el gym escribe y manda a un grupo de socios.

    Es el hueco que faltaba: el catálogo de ocasiones cubre lo automático
    (vencimientos, cumpleaños, win-back) pero no había forma de decirle algo a
    los socios — "cerramos el festivo", "clase nueva los martes".

    Se guarda lo ENVIADO, no una plantilla: el texto y el segmento quedan como
    estaban al momento del envío, y `recipients` dice a cuántos se encoló.
    """
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    #: Clave de `app.services.segments.SEGMENTS`
    segment: Mapped[str] = mapped_column(String(40), nullable=False)
    #: Parámetros del segmento (p.ej. {"plan_id": "..."}).
    segment_params: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    #: Nombre de la plantilla aprobada en Meta, si además salió por WhatsApp.
    meta_template_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sent_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    sent_by_name: Mapped[str] = mapped_column(String(255), nullable=False, default="sistema")
