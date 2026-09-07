import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, ForeignKey, Index, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class Routine(TenantBase, TenantTimestampMixin):
    """Rutina del gym: días → ejercicios (series × reps). Puede publicarse en la
    pantalla del gym y asignarse a socios (la app la lee igual)."""
    __tablename__ = "routines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    goal: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)   # hipertrofia | fuerza | perdida_grasa | resistencia | movilidad | general
    level: Mapped[str] = mapped_column(String(20), nullable=False, default="beginner")
    days_per_week: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    is_public_on_screen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class RoutineDay(TenantBase):
    __tablename__ = "routine_days"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    routine_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("routines.id", ondelete="CASCADE"), nullable=False, index=True)
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)


class RoutineExercise(TenantBase):
    __tablename__ = "routine_exercises"
    __table_args__ = (Index("ix_routine_exercises_day_order", "day_id", "order"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("routine_days.id", ondelete="CASCADE"), nullable=False)
    # Referencia al catálogo global (Master DB): no hay FK entre bases
    exercise_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    exercise_name: Mapped[str] = mapped_column(String(200), nullable=False)  # snapshot para listas rápidas
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sets: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    reps: Mapped[str] = mapped_column(String(40), nullable=False, default="10-12")  # "10-12", "AMRAP", "30 seg"
    rest_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    notes: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    video_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)


class MemberRoutine(TenantBase):
    """Rutina asignada a un socio (una vigente por socio; el historial queda)."""
    __tablename__ = "member_routines"
    __table_args__ = (Index("ix_member_routines_member", "member_id", "assigned_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("members.id"), nullable=False)
    routine_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("routines.id"), nullable=False)
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
