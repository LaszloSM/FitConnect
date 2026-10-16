import uuid
import enum
from typing import Optional
from datetime import date, datetime
from sqlalchemy import String, Enum as SAEnum, Date, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from app.db.master_base import MasterBase, MasterTimestampMixin


class SubscriptionPlan(str, enum.Enum):
    basic = "basic"
    advanced = "advanced"
    premium_ai = "premium_ai"


class TenantStatus(str, enum.Enum):
    #: Prueba gratis hasta `trial_ends_at`.
    trialing = "trialing"
    active = "active"
    #: Venció la prueba o el pago: todo funciona unos días con aviso.
    past_due = "past_due"
    #: Solo lectura: se puede consultar pero no registrar cambios (los socios siguen entrando).
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
    country: Mapped[str | None] = mapped_column(String(2), nullable=True, default="CO")
    operating_hours: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=None)
    # ─── Suscripción a LSMFit (lo gestiona el panel de plataforma) ───
    trial_ends_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    #: Cortesía: acceso completo sin cobro hasta esta fecha (pilotos, aliados).
    comp_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    comp_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    #: Último día cubierto por los pagos registrados en el panel. Sin fecha = sin cobros registrados.
    paid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    #: Precio mensual acordado con este gimnasio (COP). Sin valor = precio de lista del plan.
    price_cop: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    #: Desde cuándo está en el estado actual (para pasar de mora a solo lectura).
    status_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    #: Módulos activados además del plan: {"member_app": true, "ai": false}
    modules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    internal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
