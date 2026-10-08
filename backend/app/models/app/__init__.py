"""Base `fitconnect_app`: lo que la persona registra en la app para sí misma.

Se crea con `create_all` al primer uso (igual que las bases de los gimnasios).
Toda columna nueva sobre una tabla existente necesita su `ALTER ... IF NOT
EXISTS` en `app.db.app_db.ALIGN_STATEMENTS`.
"""
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, Text
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


class Food(AppBase):
    """Alimento con su aporte por 100 g. `source`: reference (tabla incluida),
    openfoodfacts (código de barras) o custom (lo creó una persona, solo lo ve ella)."""
    __tablename__ = "foods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    brand: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    barcode: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, unique=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="reference")
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    kcal: Mapped[float] = mapped_column(Numeric(7, 1), nullable=False)
    protein_g: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    carbs_g: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    fat_g: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    fiber_g: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    portions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MealEntry(AppBase):
    """Lo que la persona comió. Guarda el aporte calculado al momento: si el
    alimento cambia después, el registro de ese día no se mueve."""
    __tablename__ = "meal_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal: Mapped[str] = mapped_column(String(20), nullable=False)
    food_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    food_name: Mapped[str] = mapped_column(String(200), nullable=False)
    grams: Mapped[float] = mapped_column(Numeric(7, 1), nullable=False)
    kcal: Mapped[float] = mapped_column(Numeric(7, 1), nullable=False)
    protein_g: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    carbs_g: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    fat_g: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class SavedPlan(AppBase):
    """Plan que armó el asistente (o la persona). `kind`: training | meals.
    `data` sigue el esquema validado en services/assistant.py."""
    __tablename__ = "saved_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AssistantMessage(AppBase):
    __tablename__ = "assistant_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    plan_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    flagged: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
