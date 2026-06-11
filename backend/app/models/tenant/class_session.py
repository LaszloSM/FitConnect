import uuid
import enum
from datetime import date, time
from sqlalchemy import String, Integer, ForeignKey, Date, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class SessionStatus(str, enum.Enum):
    scheduled = "scheduled"
    cancelled = "cancelled"
    completed = "completed"


class ClassSession(TenantBase, TenantTimestampMixin):
    """Ocurrencia individual de una clase (permite overrides por sesión)."""
    __tablename__ = "class_sessions"
    __table_args__ = (
        UniqueConstraint("gym_class_id", "session_date", "start_time", name="uq_session_class_date_time"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gym_class_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("gym_classes.id"), nullable=False, index=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[SessionStatus] = mapped_column(String(20), default=SessionStatus.scheduled, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    # Overrides opcionales para esta sesión específica
    instructor_override: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    capacity_override: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
