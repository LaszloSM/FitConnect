import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class ClassEnrollment(TenantBase, TenantTimestampMixin):
    """Inscripción de miembros a clases grupales."""
    __tablename__ = "class_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gym_class_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("gym_classes.id"), nullable=False, index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
