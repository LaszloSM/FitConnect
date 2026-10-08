"""Base `fitconnect_app`: lo que la persona registra en la app para sí misma.

Se crea con `create_all` al primer uso (igual que las bases de los gimnasios).
Toda columna nueva sobre una tabla existente necesita su `ALTER ... IF NOT
EXISTS` en `app.db.app_db.ALIGN_STATEMENTS`.
"""
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class AppBase(DeclarativeBase):
    pass


class AppProfile(AppBase):
    """Datos para calcular cargas, calorías y progreso. Talla y peso son datos
    de salud: solo se guardan con el consentimiento `health` vigente."""
    __tablename__ = "app_profiles"

    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    sex: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    height_cm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Numeric(5, 1), nullable=True)
    goal: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    activity_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow,
                                                 onupdate=datetime.utcnow)


class Workout(AppBase):
    """Un entreno registrado. El id lo genera el celular: reenviarlo sin señal
    no lo duplica.

    `entries`: [{exercise_id, exercise_name, sets: [{reps, weight_kg, done}]}]
    """
    __tablename__ = "workouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    routine_ref: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    entries: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
