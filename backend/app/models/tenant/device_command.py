import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, Sequence, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.tenant_base import TenantBase, TenantTimestampMixin

# ZKTeco exige un ID numérico en cada comando ("C:123:DATA ..."): la secuencia
# va ligada a la metadata para que también exista en los gyms nuevos.
device_command_seq = Sequence("device_command_seq", start=1, metadata=TenantBase.metadata)


class DeviceCommand(TenantBase, TenantTimestampMixin):
    """Cola de órdenes para un equipo de acceso (torniquete, lector).

    El comando se guarda en términos de FitConnect (`kind` + `payload`); cada
    protocolo lo traduce al formato del equipo al entregarlo: ZKTeco ADMS lo
    convierte en texto en `/iclock/getrequest`, el agente local lo traduce a
    ISAPI de Hikvision o al protocolo TCP de ZKTeco.

    Estados: pending → sent → done | failed. Un `sent` que nunca recibe
    respuesta vuelve a `pending` (el equipo pudo apagarse a mitad).
    """
    __tablename__ = "device_commands"
    __table_args__ = (
        Index("ix_device_commands_pending", "device_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wire_id: Mapped[int] = mapped_column(
        BigInteger, device_command_seq, server_default=device_command_seq.next_value(), nullable=False, unique=True
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kiosk_devices.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: user_sync | user_remove | enroll_fingerprint | enroll_face | face_photo | open_door | query_users
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    return_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
