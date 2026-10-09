"""Base `fitconnect_app`: lo que la persona registra en la app para sí misma.

Se crea con `create_all` al primer uso (igual que las bases de los gimnasios).
Toda columna nueva sobre una tabla existente necesita su `ALTER ... IF NOT
EXISTS` en `app.db.app_db.ALIGN_STATEMENTS`.
"""
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, PrimaryKeyConstraint, String, Text, UniqueConstraint
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
    #: Ritmo del objetivo: gentle/moderate/aggressive al bajar grasa, lean/standard al ganar músculo.
    pace: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
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
    """Alimento con su aporte por 100 g.

    `source`: reference (base incluida), openfoodfacts (código de barras),
    custom (lo creó una persona) o recipe (una «mi comida» hecha de varios
    alimentos). Los dos últimos tienen `owner_id` y solo los ve su dueño.

    `nutrients`: micronutrientes por 100 g (`NUTRIENT_KEYS` de services/foods).
    Una clave ausente o en null es «sin dato», nunca cero.
    """
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
    #: Clave estable de la base incluida: permite actualizarla sin duplicar.
    ref_key: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, unique=True)
    category: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    synonyms: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    nutrients: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    #: Nombre y sinónimos en minúscula y sin tildes: la búsqueda no depende de unaccent.
    search_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    #: De dónde salen los valores («USDA SR Legacy 9040», «Estimado por receta», «Etiqueta»).
    origin: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    #: Ingredientes de una receta: [{food_id, name, grams}].
    components: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    data_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, onupdate=datetime.utcnow)


class FoodFavorite(AppBase):
    __tablename__ = "food_favorites"
    __table_args__ = (PrimaryKeyConstraint("app_user_id", "food_id"),)

    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    food_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
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
    fiber_g: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False, default=0)
    #: Micronutrientes del registro (misma forma que Food.nutrients, ya multiplicados).
    nutrients: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class WeightLog(AppBase):
    """Peso por día para la curva de progreso. Es dato de salud: se borra con
    la autorización `health`."""
    __tablename__ = "weight_logs"
    __table_args__ = (PrimaryKeyConstraint("app_user_id", "day"),)

    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Numeric(5, 1), nullable=False)
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


class PlanJob(AppBase):
    """Pedido de plan. Se procesa en fila para respetar la cuota del proveedor
    de IA; si la cuota está llena o el modelo falla, sale un plan automático.

    `status`: queued, running, done, failed. `engine`: ai o auto (lo que de
    verdad lo generó). El id lo manda el celular: reintentar no cobra dos veces.
    """
    __tablename__ = "plan_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="queued", index=True)
    request: Mapped[dict] = mapped_column(JSONB, nullable=False)
    engine: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class CreditEntry(AppBase):
    """Libro de créditos para planes con IA: solo se agregan filas.

    `kind`: welcome, weekly, spend, refund (y, cuando existan, ad, purchase).
    `ref` hace idempotente cada movimiento (el id del pedido, la semana…).
    """
    __tablename__ = "credit_entries"
    __table_args__ = (UniqueConstraint("app_user_id", "kind", "ref", name="uq_credit_ref"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    app_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    ref: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
