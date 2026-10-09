import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class ProfileLink(TenantBase, TenantTimestampMixin):
    """Enlace para que el socio complete sus datos (por WhatsApp, correo o la app).

    Solo se guarda el hash del token. Sirve una sola vez (al enviar el formulario)
    y vence a los 7 días. Solo puede LLENAR campos vacíos de ese socio: quien
    reciba el enlace reenviado no puede cambiar lo que el gimnasio ya tiene.
    """
    __tablename__ = "profile_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="link")
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
