import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from app.db.master_base import MasterBase, MasterTimestampMixin


class StaffInvitation(MasterBase, MasterTimestampMixin):
    """Invitación de staff de un solo uso, resoluble sin auth desde el endpoint
    público de aceptación. Guarda solo el hash del token (nunca el token plano);
    el link con el token se entrega al invitado por fuera (el owner lo comparte).
    """
    __tablename__ = "staff_invitations"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_staff_invitations_token_hash"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    db_name: Mapped[str] = mapped_column(String(255), nullable=False)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
