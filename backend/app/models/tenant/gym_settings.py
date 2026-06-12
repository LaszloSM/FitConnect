import uuid
from sqlalchemy import String, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class GymSettings(TenantBase, TenantTimestampMixin):
    """Configuración operativa del gym (fila única por tenant DB).

    Los secretos (Wompi private key, token de WhatsApp) se guardan cifrados
    con Fernet — leer/escribir siempre vía app.services.gym_settings.
    """
    __tablename__ = "gym_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grace_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="America/Bogota", nullable=False)
    receipt_prefix: Mapped[str] = mapped_column(String(10), default="FC", nullable=False)

    wompi_public_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    wompi_private_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    wompi_events_secret: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    wompi_integrity_secret: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    whatsapp_phone_number_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    whatsapp_access_token: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # Cuentas de recaudo para transferencias manuales (Nequi, Daviplata, bancos):
    # lista de {type, label, account_number, holder_name}
    transfer_accounts: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    # Datos fiscales — base para facturación electrónica DIAN (fase posterior)
    legal_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    nit: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    tax_regime: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
