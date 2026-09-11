import uuid
from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class Instructor(TenantBase, TenantTimestampMixin):
    """Entrenadores del gym.

    La fila vive por su cuenta (un instructor de catálogo, sin cuenta), y se
    enlaza con `staff_id` cuando esa persona se invita como usuario con rol
    `trainer`. Así las clases y sus snapshots históricos no se tocan: el vínculo
    se agrega, no se reemplaza.
    """
    __tablename__ = "instructors"
    __table_args__ = (UniqueConstraint("staff_id", name="uq_instructor_staff"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    specialty: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    #: Usuario con rol `trainer` que es esta persona, si entra a la app.
    staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
