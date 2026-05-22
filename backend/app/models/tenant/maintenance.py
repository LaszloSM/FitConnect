import uuid
from decimal import Decimal
from datetime import date
from sqlalchemy import String, ForeignKey, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MaintenanceLog(TenantBase, TenantTimestampMixin):
    """Historial de mantenimiento de máquinas."""
    __tablename__ = "maintenance_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    machine_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(1000), nullable=False)
    technician: Mapped[str] = mapped_column(String(255), nullable=False)
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    resolved_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
