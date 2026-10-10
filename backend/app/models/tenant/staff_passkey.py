import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class StaffPasskey(TenantBase, TenantTimestampMixin):
    """Llave de acceso (WebAuthn) de una persona del equipo, para el segundo paso.

    Solo se guarda la parte pública de la llave: la privada nunca sale del
    equipo de la persona (huella, rostro o PIN).
    """
    __tablename__ = "staff_passkeys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    credential_id: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    sign_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    transports: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
