import uuid
import enum
from sqlalchemy import String, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from app.db.base import Base, TimestampMixin


class SubscriptionPlan(str, enum.Enum):
    basic = "basic"
    advanced = "advanced"
    premium_ai = "premium_ai"


class TenantStatus(str, enum.Enum):
    active = "active"
    read_only = "read_only"
    suspended = "suspended"


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    plan: Mapped[SubscriptionPlan] = mapped_column(SAEnum(SubscriptionPlan), default=SubscriptionPlan.basic, nullable=False)
    status: Mapped[TenantStatus] = mapped_column(SAEnum(TenantStatus), default=TenantStatus.active, nullable=False)
    wompi_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    users = relationship("User", back_populates="tenant")
    locations = relationship("Location", back_populates="tenant")
