import uuid
from sqlalchemy import String, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from app.db.master_base import MasterBase, MasterTimestampMixin


class StaffDirectory(MasterBase, MasterTimestampMixin):
    """Índice global email → tenant para login de staff en multi-tenant.

    El staff (admin/recepción) entra solo con email + contraseña; esta tabla
    resuelve en qué tenant DB validar sus credenciales. Email único global en MVP.
    """
    __tablename__ = "staff_directory"
    __table_args__ = (UniqueConstraint("email", name="uq_staff_directory_email"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    db_name: Mapped[str] = mapped_column(String(255), nullable=False)
    staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
