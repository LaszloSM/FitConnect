import uuid
import enum
from sqlalchemy import String, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MachineStatus(str, enum.Enum):
    active = "active"
    maintenance = "maintenance"
    damaged = "damaged"
    retired = "retired"


class Machine(TenantBase, TenantTimestampMixin):
    """Máquinas del gym."""
    __tablename__ = "machines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[MachineStatus] = mapped_column(SAEnum(MachineStatus), default=MachineStatus.active, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
