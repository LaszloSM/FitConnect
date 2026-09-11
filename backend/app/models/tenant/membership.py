import uuid
import enum
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import String, ForeignKey, Date, DateTime, Numeric, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MembershipStatus(str, enum.Enum):
    active = "active"
    frozen = "frozen"
    expired = "expired"
    cancelled = "cancelled"


class Membership(TenantBase, TenantTimestampMixin):
    """Membresías activas de cada miembro."""
    __tablename__ = "memberships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
    # FK al catálogo de planes. plan_name/price/duration son snapshot histórico
    # del momento del cobro: si el plan cambia o se archiva, el cobro no se altera.
    plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("member_plans.id"), nullable=True, index=True)
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # price es el precio NETO cobrado (con descuento ya aplicado);
    # discount_amount/reason/promo_code_id documentan el descuento.
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    discount_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    promo_code_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("promo_codes.id"), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    # String en vez de enum nativo de Postgres para poder agregar estados sin ALTER TYPE.
    status: Mapped[str] = mapped_column(String(20), default=MembershipStatus.active.value, nullable=False)
    # Cuándo la marcó expirada el job diario (None si expiró por backfill o sigue activa)
    expired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Snapshot de los derechos del plan al momento de la venta: editar el plan
    # después no cambia lo que el miembro ya compró.
    access_type: Mapped[str] = mapped_column(
        String(20), default="gym_and_classes", server_default="gym_and_classes", nullable=False
    )
    class_credits_per_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    includes_trainer: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    trainer_sessions_per_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
