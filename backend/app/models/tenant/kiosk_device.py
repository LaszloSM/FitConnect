import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class KioskDevice(TenantBase, TenantTimestampMixin):
    """Dispositivo kiosko de la entrada (tablet/celular). El token JWT del
    dispositivo no expira; se revoca poniendo is_active=False."""
    __tablename__ = "kiosk_devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    token_jti: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Bloque 6: el mismo registro sirve para kiosko, torniquete, lector o pantalla
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="kiosk", server_default="kiosk")
    vendor: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    serial: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    offline_policy: Mapped[str] = mapped_column(String(20), nullable=False, default="deny", server_default="deny")
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
