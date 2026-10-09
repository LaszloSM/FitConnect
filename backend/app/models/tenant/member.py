import uuid
import enum
from datetime import date
from sqlalchemy import Boolean, String, Enum as SAEnum, Date, DateTime, ForeignKey, Index, text
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


def _generate_qr_code() -> str:
    return str(uuid.uuid4())


class MemberStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class MemberType(str, enum.Enum):
    member = "member"
    # Registro exprés del pase del día (cédula + nombre); convertible a socio
    visitor = "visitor"
    # Personal del gimnasio que además entrena aquí. Ocupa el gimnasio como
    # cualquiera (aforo, check-ins, horas pico) pero no es negocio: se excluye
    # de ingresos, morosidad, churn y proyecciones.
    staff = "staff"


class IdType(str, enum.Enum):
    CC = "CC"   # Cédula de Ciudadanía
    NIT = "NIT" # Número de Identificación Tributaria
    CE = "CE"   # Cédula de Extranjería
    PP = "PP"   # Pasaporte
    TI = "TI"   # Tarjeta de Identidad


class Gender(str, enum.Enum):
    M = "M"
    F = "F"
    other = "other"


class TrainingGoal(str, enum.Enum):
    weight_loss = "weight_loss"
    muscle_gain = "muscle_gain"
    endurance = "endurance"
    flexibility = "flexibility"
    general_fitness = "general_fitness"


def is_business_member():
    """Criterio único de «socio» para los indicadores de negocio.

    La tabla `members` guarda tres poblaciones: los socios, los visitantes del
    pase del día (registro exprés, no son socios) y el personal del gimnasio
    (entrena aquí pero no paga). Contar las tres juntas infla el total de socios,
    los nuevos del mes y el riesgo de abandono.
    """
    return Member.member_type == MemberType.member.value


class Member(TenantBase, TenantTimestampMixin):
    __tablename__ = "members"
    __table_args__ = (
        # Email único cuando existe — los visitantes del pase del día no traen correo.
        Index(
            "uq_member_email",
            "email",
            unique=True,
            postgresql_where=text("email IS NOT NULL"),
        ),
        # Cédula única cuando existe — los miembros antiguos sin documento siguen siendo válidos.
        # Declarado en metadata porque los tenants nuevos nacen con create_all + stamp.
        Index(
            "uq_member_id_number",
            "id_number",
            unique=True,
            postgresql_where=text("id_number IS NOT NULL"),
        ),
        # Una persona del equipo tiene una sola ficha de socio.
        Index(
            "uq_members_staff_id",
            "staff_id",
            unique=True,
            postgresql_where=text("staff_id IS NOT NULL"),
        ),
        Index(
            "uq_members_instructor_profile_id",
            "instructor_profile_id",
            unique=True,
            postgresql_where=text("instructor_profile_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    member_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=MemberType.member.value, server_default="member",
    )
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    id_type: Mapped[Optional[IdType]] = mapped_column(SAEnum(IdType), nullable=True)
    id_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    gender: Mapped[Optional[Gender]] = mapped_column(SAEnum(Gender), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(2), nullable=True, default="CO")
    # Contacto de emergencia
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    blood_type: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    # Se guarda la KEY del objeto (privado, se firma al leer); las filas viejas traen URL completa
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Ley 1581: cuándo aceptó la política de datos y el uso de su imagen
    consent_data_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    consent_image_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # PAR-Q: {"q1": true, "q2": false, ...} — 7 preguntas estándar
    parq_answers: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    parq_completed_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    training_goal: Mapped[Optional[TrainingGoal]] = mapped_column(SAEnum(TrainingGoal), nullable=True)
    # UUID único para QR de check-in rápido — autogenerado al crear el miembro
    qr_code: Mapped[str] = mapped_column(
        String(36), nullable=False, unique=True, index=True, default=_generate_qr_code
    )
    status: Mapped[MemberStatus] = mapped_column(SAEnum(MemberStatus), default=MemberStatus.active, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    #: Entrenador asignado. El plan puede exigirlo (`includes_trainer`).
    trainer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instructors.id"), nullable=True, index=True
    )
    #: Esta persona ES un usuario del sistema. No confundir con `trainer_id`,
    #: que dice quién la entrena. Se llena solo para `member_type = staff`.
    staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    #: Esta persona ES una ficha de entrenador. El equipo tiene dos poblaciones
    #: —con cuenta y sin ella— y ambas entran al gimnasio.
    instructor_profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instructors.id"), nullable=True
    )
    eps: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    #: Lo que la persona dijo que busca, en sus palabras (el software anterior lo
    #: llamaba "Expectativa"). `training_goal` es la versión normalizada.
    expectation: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    #: Puede entrar digitando su cédula (teclado del torniquete o kiosko), sin
    #: rostro ni huella.
    access_by_document: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    #: Lote de importación que creó la ficha (para poder deshacerlo).
    import_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("import_batches.id"), nullable=True, index=True
    )
