import uuid
import enum
from datetime import date
from sqlalchemy import String, ForeignKey, Date, Integer, Enum as SAEnum, Index, text
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
    __table_args__ = (
        # El token del QR pegado en la máquina: único cuando existe.
        Index(
            "uq_machines_report_token",
            "report_token",
            unique=True,
            postgresql_where=text("report_token IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Slug estable (`services/machine_areas.py`), nunca la etiqueta visible.
    area: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[MachineStatus] = mapped_column(SAEnum(MachineStatus), default=MachineStatus.active, nullable=False)
    last_maintenance_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Mantenimiento preventivo: alerta cuando last + interval <= hoy
    maintenance_interval_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    # Contra quién se reclama la garantía: el historial sin proveedor ni fecha
    # de vencimiento no sirve para nada en la conversación con el vendedor.
    purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    supplier: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    warranty_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    report_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
