import uuid
import enum
from datetime import date
from decimal import Decimal
from sqlalchemy import String, Boolean, Integer, Numeric, Date, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class DayPassType(TenantBase, TenantTimestampMixin):
    """Catálogo de pases del gym: 'Día', 'Día con entrenador', 'Pareja'..."""
    __tablename__ = "day_pass_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    includes_trainer: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)


class DayPassStatus(str, enum.Enum):
    pending = "pending"   # vendido por transferencia/Wompi, aún sin confirmar
    active = "active"     # pagado: da acceso todo el día valid_on
    void = "void"         # el pago nunca llegó


class DayPass(TenantBase, TenantTimestampMixin):
    """Entrada de un día (ingresos ilimitados en valid_on, fecha Bogotá)."""
    __tablename__ = "day_passes"
    __table_args__ = (
        Index("ix_day_passes_member_valid", "member_id", "valid_on"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False)
    pass_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("day_pass_types.id"), nullable=True)
    # Snapshot: el tipo puede renombrarse o archivarse después
    pass_name: Mapped[str] = mapped_column(String(100), nullable=False)
    includes_trainer: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    valid_on: Mapped[date] = mapped_column(Date, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=DayPassStatus.pending.value, server_default="pending")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
