"""Control de acceso por hardware (torniquete, lector biométrico, tarjeta).

La plantilla biométrica NUNCA se guarda aquí: vive en el lector. Solo se
guarda el mapeo (kind + device_user_id → socio) y el consentimiento firmado.
"""
import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Boolean, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped

from app.core.timeutil import utcnow_naive
from app.db.tenant_base import TenantBase


class CredentialKind(str, enum.Enum):
    fingerprint = "fingerprint"
    face = "face"
    card = "card"
    pin = "pin"


BIOMETRIC_KINDS = {CredentialKind.fingerprint.value, CredentialKind.face.value}


class BiometricConsent(TenantBase):
    __tablename__ = "biometric_consents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    text_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1")
    signature_method: Mapped[str] = mapped_column(String(20), nullable=False, default="checkbox")
    document_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    signed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow_naive)
    signed_by_staff: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    revoked_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class MemberCredential(TenantBase):
    __tablename__ = "member_credentials"
    __table_args__ = (
        Index("ix_member_credentials_lookup", "kind", "device_user_id"),
        Index("uq_member_credentials_global", "kind", "device_user_id", unique=True,
              postgresql_where=text("revoked_at IS NULL AND device_id IS NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("kiosk_devices.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    device_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    consent_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("biometric_consents.id", ondelete="SET NULL"), nullable=True)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow_naive)
    enrolled_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    revoked_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class AccessEvent(TenantBase):
    """Bitácora del dispositivo: cada intento (permitido, denegado, desconocido,
    offline). Los check-ins siguen siendo la asistencia de negocio."""
    __tablename__ = "access_events"
    __table_args__ = (
        Index("ix_access_events_device_time", "device_id", "occurred_at"),
        Index("uq_access_events_client", "device_id", "client_event_id", unique=True,
              postgresql_where=text("client_event_id IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("kiosk_devices.id", ondelete="SET NULL"), nullable=True)
    member_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True)
    credential_kind: Mapped[str] = mapped_column(String(20), nullable=False, default="id_number")
    credential_ref: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False, default="entry")
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    offline: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    client_event_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    checkin_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("checkins.id", ondelete="SET NULL"), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow_naive)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow_naive)
