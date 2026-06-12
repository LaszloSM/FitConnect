import uuid
import enum
from datetime import time
from sqlalchemy import String, Integer, ForeignKey, Boolean, Time
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class ClassCategory(str, enum.Enum):
    yoga = "yoga"
    crossfit = "crossfit"
    spinning = "spinning"
    pilates = "pilates"
    funcional = "funcional"
    zumba = "zumba"
    boxeo = "boxeo"
    natacion = "natacion"
    otro = "otro"


class ClassDifficulty(str, enum.Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class GymClass(TenantBase, TenantTimestampMixin):
    __tablename__ = "gym_classes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Texto legacy/snapshot; instructor_id es el vínculo real a la entidad
    instructor: Mapped[str] = mapped_column(String(255), nullable=False)
    instructor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("instructors.id"), nullable=True)
    # schedule mantenido para compatibilidad retroactiva; weekdays/start_time son el nuevo estándar
    schedule: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    weekdays: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)  # [0=Lun..6=Dom]
    start_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    category: Mapped[Optional[ClassCategory]] = mapped_column(String(50), nullable=True)
    difficulty: Mapped[Optional[ClassDifficulty]] = mapped_column(String(20), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # hex: "#F97316"
    max_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
