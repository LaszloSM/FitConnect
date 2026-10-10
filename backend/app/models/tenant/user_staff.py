import uuid
from typing import Optional
import enum
from sqlalchemy import String, Boolean, Enum as SAEnum, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import mapped_column, Mapped
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class UserRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    receptionist = "receptionist"
    trainer = "trainer"


class UserStaff(TenantBase, TenantTimestampMixin):
    """Staff del gym: owner, admin, receptionist, trainer.
    Cada gym tiene su propia tabla de staff en su DB independiente.
    El owner aquí es el mismo email del Owner de la Master DB (para login unificado).
    """
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_user_email"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.receptionist, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Verificación en dos pasos por app autenticadora (opcional, recomendada).
    totp_secret_enc: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    backup_codes: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    # Otros métodos del segundo paso (todos opcionales): código al correo y llaves
    # de acceso (ver staff_passkeys). `mfa_preferred` es el que se pide primero.
    mfa_email_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    mfa_passkey_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    mfa_preferred: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
