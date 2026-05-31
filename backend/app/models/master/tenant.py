import uuid
import enum
from typing import Optional
from sqlalchemy import String, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from app.db.master_base import MasterBase, MasterTimestampMixin


class SubscriptionPlan(str, enum.Enum):
    basic = "basic"
    advanced = "advanced"
    premium_ai = "premium_ai"


class TenantStatus(str, enum.Enum):
    active = "active"
    read_only = "read_only"
    suspended = "suspended"


class Tenant(MasterBase, MasterTimestampMixin):
    """Registro maestro de cada gym en la plataforma SaaS.
    La DB real del gym es independiente; este registro guarda metadata + connection string.
    """
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    db_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    db_connection_string: Mapped[str] = mapped_column(String(500), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    plan: Mapped[SubscriptionPlan] = mapped_column(SAEnum(SubscriptionPlan), default=SubscriptionPlan.basic, nullable=False)
    status: Mapped[TenantStatus] = mapped_column(SAEnum(TenantStatus), default=TenantStatus.active, nullable=False)
    wompi_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    operating_hours: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=None)
