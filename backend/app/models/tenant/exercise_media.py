"""Video propio del gym para un ejercicio del catálogo global.

El catálogo es igual para todos, pero cada gym tiene sus máquinas: poder grabar
"así se hace en ESTA polea" es lo que de verdad le sirve al socio. No son datos
personales, así que viven en el prefijo público `exercises/` del bucket.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped

from app.core.timeutil import utcnow_naive
from app.db.tenant_base import TenantBase


class ExerciseMedia(TenantBase):
    __tablename__ = "exercise_media"
    __table_args__ = (
        Index("uq_exercise_media_exercise", "exercise_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Sin FK: el catálogo vive en la Master DB
    exercise_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    video_url: Mapped[str] = mapped_column(String(500), nullable=False)
    poster_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow_naive)
