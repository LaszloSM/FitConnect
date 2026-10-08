import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class DeviceUser(TenantBase, TenantTimestampMixin):
    """Lo que FitConnect sabe de cada usuario guardado DENTRO de un equipo.

    Sirve para tres cosas: saber a quién hay que sincronizar (solo se le habla
    al equipo de las personas que tiene), mostrar "enlazados / sin socio /
    socios sin enrolar" al tomar el control de un torniquete que manejaba otro
    programa, y no reenviar lo que ya está igual (`synced_hash`).

    No guarda plantillas biométricas: solo si el equipo dice que tiene rostro
    o huella para ese PIN.
    """
    __tablename__ = "device_users"
    __table_args__ = (UniqueConstraint("device_id", "pin", name="uq_device_users_device_pin"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kiosk_devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pin: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    member_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    has_face: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fingerprint_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    has_card: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: El equipo lo tiene (False tras borrarlo: se conserva la fila para el historial)
    present: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    #: Último estado que FitConnect le envió y el equipo confirmó
    enabled: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    synced_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
