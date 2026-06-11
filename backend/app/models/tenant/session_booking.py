import uuid
from datetime import datetime
from sqlalchemy import ForeignKey, String, Integer, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class SessionBooking(TenantBase, TenantTimestampMixin):
    """Reserva de un miembro a una sesión concreta de clase."""
    __tablename__ = "session_bookings"
    __table_args__ = (UniqueConstraint("session_id", "member_id", name="uq_session_member"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("class_sessions.id"), nullable=False, index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False, index=True)
    # booked | waitlisted | cancelled | attended | no_show
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="booked")
    waitlist_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    booked_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
