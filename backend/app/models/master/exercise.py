import uuid
from sqlalchemy import String, Integer, Boolean, Index
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.master_base import MasterBase, MasterTimestampMixin


class Exercise(MasterBase, MasterTimestampMixin):
    """Biblioteca global de ejercicios (igual para todos los gyms y la app).
    Fuente: free-exercise-db (MIT). Las imágenes inicio/fin son el 'muñequito'."""
    __tablename__ = "exercises"
    __table_args__ = (
        Index("ix_exercises_search", "name_es", "name_en"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name_en: Mapped[str] = mapped_column(String(200), nullable=False)
    name_es: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)          # strength | stretching | cardio ...
    level: Mapped[str] = mapped_column(String(20), nullable=False)             # beginner | intermediate | expert
    force: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)    # push | pull | static
    mechanic: Mapped[Optional[str]] = mapped_column(String(20), nullable=True) # compound | isolation
    equipment: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    primary_muscles: Mapped[list] = mapped_column(ARRAY(String(40)), nullable=False, default=list)
    secondary_muscles: Mapped[list] = mapped_column(ARRAY(String(40)), nullable=False, default=list)
    instructions_en: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    instructions_es: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # URLs inicio/fin
    # Video del catálogo global (wger, CC-BY-SA): movimiento real donde exista.
    # La atribución es obligación de la licencia, por eso viaja con el video.
    video_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    video_license: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    video_author: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sort_weight: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # populares primero
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
