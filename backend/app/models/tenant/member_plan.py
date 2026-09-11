import uuid
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MemberPlan(TenantBase, TenantTimestampMixin):
    """Planes de membresía que el gym ofrece a sus miembros (catálogo)."""
    __tablename__ = "member_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Qué incluye el plan: gym_only | gym_and_classes (estándar del mercado).
    # class_credits_per_month: NULL = clases ilimitadas (si el plan las incluye).
    access_type: Mapped[str] = mapped_column(
        String(20), default="gym_and_classes", server_default="gym_and_classes", nullable=False
    )
    class_credits_per_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Plan con entrenador incluido. trainer_sessions_per_month: NULL = sin tope.
    includes_trainer: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    trainer_sessions_per_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
