import uuid
import enum
from datetime import date
from decimal import Decimal
from sqlalchemy import String, ForeignKey, Enum as SAEnum, Date, Numeric, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MembershipStatus(str, enum.Enum):
    active = "active"
    expired = "expired"
    cancelled = "cancelled"


class Membership(TenantBase, TenantTimestampMixin):
    """Membresías activas de cada miembro."""
    __tablename__ = "memberships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[MembershipStatus] = mapped_column(SAEnum(MembershipStatus), default=MembershipStatus.active, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
