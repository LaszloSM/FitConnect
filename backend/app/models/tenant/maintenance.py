import uuid
from decimal import Decimal
from datetime import date
from sqlalchemy import String, ForeignKey, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MaintenanceLog(TenantBase, TenantTimestampMixin):
    """Historial de mantenimiento de máquinas.

    Un engrase programado y una banda rota no son lo mismo: `kind` los separa
    para que el preventivo cuente para el ciclo y el correctivo cuente para
    decidir si la máquina ya no vale la pena.
    """
    __tablename__ = "maintenance_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # CASCADE: borrar una máquina sin historial no puede reventar por la FK.
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(1000), nullable=False)
    technician: Mapped[str] = mapped_column(String(255), nullable=False)
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    resolved_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    #: preventivo | correctivo
    kind: Mapped[str] = mapped_column(
        String(20), default="preventivo", server_default="preventivo", nullable=False
    )
    #: Quién reportó la falla (staff, o "Pantalla del gym" si vino del kiosko).
    reported_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
