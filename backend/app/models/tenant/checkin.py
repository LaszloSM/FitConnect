import uuid
import enum
from sqlalchemy import String, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class CheckInType(str, enum.Enum):
    entry = "entry"
    exit = "exit"


class CheckIn(TenantBase, TenantTimestampMixin):
    """Registro de entradas y salidas de miembros al gym."""
    __tablename__ = "checkins"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    # Conservado por compatibilidad; el check-in es un evento único de asistencia
    # (siempre 'entry'). La UI ya no distingue entrada/salida.
    type: Mapped[CheckInType] = mapped_column(SAEnum(CheckInType), nullable=False, default=CheckInType.entry)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # allowed | denied | override — registramos también los intentos denegados.
    decision: Mapped[str] = mapped_column(String(20), nullable=False, default="allowed")
    # Por qué se denegó: expired | frozen | no_membership (None si allowed)
    denial_reason: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Quién autorizó un override (recepcionista) y con qué motivo
    override_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    override_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
