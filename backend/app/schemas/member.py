import uuid
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.services.storage import resolve_media_url

from app.models.tenant.member import MemberStatus, IdType, Gender, TrainingGoal
from app.models.tenant.payment import PaymentMethod, PaymentStatus, PaymentKind
from app.models.tenant.membership import MembershipStatus
from app.schemas.pos import PaymentItemIn, PaymentItemOut


# ─── Member ───
class MemberBase(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    # Opcional: los visitantes del pase del día se registran solo con cédula
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=50)
    id_type: Optional[IdType] = None
    id_number: Optional[str] = Field(default=None, max_length=50)
    gender: Optional[Gender] = None
    birth_date: Optional[date] = None
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default="CO", max_length=2)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=255)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=50)
    blood_type: Optional[str] = Field(default=None, max_length=5)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    parq_answers: Optional[dict] = None
    parq_completed_at: Optional[date] = None
    training_goal: Optional[TrainingGoal] = None
    status: MemberStatus = MemberStatus.active
    notes: Optional[str] = Field(default=None, max_length=1000)
    trainer_id: Optional[uuid.UUID] = None
    eps: Optional[str] = Field(default=None, max_length=100)
    expectation: Optional[str] = Field(default=None, max_length=500)
    access_by_document: bool = False

    @field_validator("phone", "emergency_contact_phone", mode="before")
    @classmethod
    def normalize_colombian_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        digits = re.sub(r"\D", "", v)
        if digits.startswith("57") and len(digits) == 12:
            digits = digits[2:]
        if len(digits) == 10 and digits.startswith("3"):
            return f"+57{digits}"
        # Aceptar sin formato estricto si no cumple — validación suave
        return v

    @field_validator("id_number", mode="before")
    @classmethod
    def validate_id_number(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        return v.strip()

    @field_validator("blood_type", mode="before")
    @classmethod
    def validate_blood_type(cls, v: Optional[str]) -> Optional[str]:
        valid = {"A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"}
        if v and v.upper() not in valid:
            raise ValueError(f"Grupo sanguíneo inválido. Válidos: {', '.join(sorted(valid))}")
        return v.upper() if v else v


PARQ_REQUIRED_KEYS = {f"q{i}" for i in range(1, 8)}


class MemberCreate(MemberBase):
    email: EmailStr
    # Alta completa desde el panel: la cédula es el identificador natural
    # (kiosko, búsqueda, antiduplicados) y los datos de contacto, salud y
    # membresía son obligatorios. Los miembros legacy entran por el import
    # de Excel (MemberBase), que sigue siendo flexible.
    id_type: IdType
    id_number: str = Field(min_length=3, max_length=50)
    phone: str = Field(min_length=7, max_length=50)
    birth_date: date
    address: str = Field(min_length=3, max_length=500)
    city: str = Field(min_length=2, max_length=100)
    emergency_contact_name: str = Field(min_length=2, max_length=255)
    emergency_contact_phone: str = Field(min_length=7, max_length=50)
    parq_answers: dict
    # La membresía es parte del alta: inicia hoy (Bogotá) siempre
    plan_id: uuid.UUID
    payment_method: Optional[str] = None  # "cash" | "transfer" | "card" | None
    # Ley 1581: el socio acepta la política de tratamiento de datos (obligatorio)
    # y, aparte, el uso de su foto (opcional)
    consent_data: bool = True
    consent_image: bool = False

    @field_validator("consent_data")
    @classmethod
    def consent_required(cls, v: bool) -> bool:
        if not v:
            raise ValueError("El socio debe aceptar la política de tratamiento de datos")
        return v

    @field_validator("parq_answers")
    @classmethod
    def parq_complete(cls, v: dict) -> dict:
        missing = PARQ_REQUIRED_KEYS - {k for k, val in v.items() if isinstance(val, bool)}
        if missing:
            raise ValueError("El cuestionario PAR-Q debe responderse completo (7 preguntas)")
        return v


class MemberUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=50)
    id_type: Optional[IdType] = None
    id_number: Optional[str] = Field(default=None, max_length=50)
    gender: Optional[Gender] = None
    birth_date: Optional[date] = None
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=2)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=255)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=50)
    blood_type: Optional[str] = Field(default=None, max_length=5)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    parq_answers: Optional[dict] = None
    parq_completed_at: Optional[date] = None
    training_goal: Optional[TrainingGoal] = None
    status: Optional[MemberStatus] = None
    notes: Optional[str] = Field(default=None, max_length=1000)
    trainer_id: Optional[uuid.UUID] = None
    eps: Optional[str] = Field(default=None, max_length=100)
    expectation: Optional[str] = Field(default=None, max_length=500)
    access_by_document: Optional[bool] = None


class MemberResponse(MemberBase):
    id: uuid.UUID
    qr_code: Optional[str] = None
    member_type: str = "member"
    consent_data_at: Optional[datetime] = None
    consent_image_at: Optional[datetime] = None
    # Sin max_length: las URLs firmadas de AWS (con security token) pasan de 500 chars
    photo_url: Optional[str] = None

    @field_validator("photo_url", mode="before")
    @classmethod
    def _signed_photo(cls, v):
        return resolve_media_url(v)

    created_at: datetime
    updated_at: datetime
    # Populated by list endpoint via JOIN — None if no membership
    membership_status: Optional[str] = None
    membership_end_date: Optional[date] = None
    membership_plan_name: Optional[str] = None

    class Config:
        from_attributes = True


class ConsentUpdate(BaseModel):
    consent_data: Optional[bool] = None
    consent_image: Optional[bool] = None


# ─── Membership ───
class MembershipBase(BaseModel):
    member_id: uuid.UUID
    plan_name: str = Field(min_length=1, max_length=100)
    # `gt=0` rompía la LECTURA: este schema también es el response, así que una
    # membresía de $0 —la cortesía del personal, una promoción gratuita— daba
    # 500 al abrir la ficha del socio. Negativo sigue sin tener sentido.
    price: Decimal = Field(ge=0, decimal_places=2)
    start_date: date
    end_date: date
    duration_days: int = Field(gt=0)
    status: MembershipStatus = MembershipStatus.active
    notes: Optional[str] = Field(default=None, max_length=500)


class MembershipCreate(MembershipBase):
    pass


class MembershipResponse(MembershipBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    discount_amount: Optional[Decimal] = None
    discount_reason: Optional[str] = None
    # Snapshot de derechos del plan al momento de la venta
    access_type: Optional[str] = None
    class_credits_per_month: Optional[int] = None
    # Derivado de end_date/status en tiempo de lectura (no persiste un status stale)
    effective_status: Optional[Literal["active", "scheduled", "frozen", "in_grace", "expired", "cancelled"]] = None

    class Config:
        from_attributes = True


# ─── Payment ───
class PaymentBase(BaseModel):
    # Nullable: una venta de mostrador a un walk-in no tiene miembro
    member_id: Optional[uuid.UUID] = None
    membership_id: Optional[uuid.UUID] = None
    amount: Decimal = Field(gt=0, decimal_places=2)
    method: Optional[PaymentMethod] = None
    status: PaymentStatus = PaymentStatus.pending
    concept: str = Field(min_length=1, max_length=500)
    external_ref: Optional[str] = Field(default=None, max_length=255)
    # Fuente del ingreso: se infiere (membresía/producto) cuando no viene
    kind: Optional[PaymentKind] = None
    # Datáfono
    card_approval_code: Optional[str] = Field(default=None, max_length=50)
    card_terminal: Optional[str] = Field(default=None, max_length=100)
    discount_amount: Decimal = Field(default=Decimal(0), ge=0, decimal_places=2)
    discount_note: Optional[str] = Field(default=None, max_length=255)


class PaymentCreate(PaymentBase):
    # Venta de productos/cargos sueltos en el mismo pago (POS)
    items: list["PaymentItemIn"] = []
    # Transferencia: a qué cuenta de recaudo (obligatorio si hay varias activas)
    transfer_account_id: Optional[str] = Field(default=None, max_length=36)

    @model_validator(mode="after")
    def member_or_items(self):
        if self.member_id is None and not self.items:
            raise ValueError("Un pago sin miembro debe tener al menos un item de venta")
        return self


class PaymentResponse(PaymentBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    kind: str = "other"
    destination_account_id: Optional[str] = None
    transfer_reference: Optional[str] = None
    proof_url: Optional[str] = None

    @field_validator("proof_url", mode="before")
    @classmethod
    def _signed_proof(cls, v):
        return resolve_media_url(v)
    proof_uploaded_at: Optional[datetime] = None
    refunded_at: Optional[datetime] = None
    refund_reason: Optional[str] = None
    refunded_amount: Decimal = Decimal("0")
    voided_at: Optional[datetime] = None
    void_reason: Optional[str] = None
    # Inyectados por el endpoint — no vienen directo de la tabla payments
    member_name: Optional[str] = None
    member_phone: Optional[str] = None
    items: list[PaymentItemOut] = []
    destination_account: Optional[dict] = None

    class Config:
        from_attributes = True


# ─── CheckIn ───
class CheckInCreate(BaseModel):
    # Evento único de asistencia: solo se necesita el miembro (+ nota opcional)
    member_id: uuid.UUID
    notes: Optional[str] = Field(default=None, max_length=255)


class CheckInResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    notes: Optional[str] = None
    decision: Optional[Literal["allowed", "denied", "override"]] = None
    denial_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    source: Optional[str] = None
    # Inyectados por el endpoint — no vienen directo de la tabla checkins
    member_name: Optional[str] = None
    membership_status: Optional[Literal["ok", "in_grace", "scheduled", "expired", "frozen", "no_membership"]] = None
    # Clase marcada como asistida automáticamente al entrar (±60 min)
    upcoming_class: Optional[dict] = None

    class Config:
        from_attributes = True


# ─── Dashboard ───
class DashboardKPIs(BaseModel):
    total_members: int
    active_members: int
    inactive_members: int
    new_members_this_month: int
    total_payments_month: Decimal
    pending_payments_month: Decimal
    checkins_today: int
    expiring_memberships_7d: int
    machines_total: int = 0
    machines_active: int = 0
    machines_maintenance: int = 0


class MemberGrowthPoint(BaseModel):
    month: str
    count: int


class RevenuePoint(BaseModel):
    month: str
    amount: Decimal


class DashboardOverview(BaseModel):
    kpis: DashboardKPIs
    member_growth: list[MemberGrowthPoint]
    revenue_history: list[RevenuePoint]
