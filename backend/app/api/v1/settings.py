from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pydantic import BaseModel, Field

from app.api.deps import (
    get_current_staff,
    get_master_tenant,
    get_master_db,
    get_tenant_db_from_token,
    check_tenant_active,
    require_role,
)
# Alias: en este módulo hay un handler de ruta que también se llama get_gym_settings
from app.services.gym_settings import get_gym_settings as load_gym_settings
from app.core.security import hash_password, verify_password
from app.models.master.tenant import Tenant
from app.models.tenant.user_staff import UserStaff, UserRole
from app.schemas.settings import (
    GymSettingsResponse,
    GymSettingsUpdate,
    NotificationPreferences,
    NotificationPreferencesUpdate,
    UserProfileResponse,
    UserProfileUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])


# ─── Operations (config operativa por tenant: gracia, zona horaria) ──────────

class OperationsSettingsResponse(BaseModel):
    grace_days: int
    timezone: str
    receipt_prefix: str


class OperationsSettingsUpdate(BaseModel):
    grace_days: int | None = Field(default=None, ge=0, le=30)
    receipt_prefix: str | None = Field(default=None, min_length=1, max_length=10)


@router.get("/operations", response_model=OperationsSettingsResponse)
async def get_operations_settings(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
) -> OperationsSettingsResponse:
    gym = await load_gym_settings(db)
    return OperationsSettingsResponse(
        grace_days=gym.grace_days,
        timezone=gym.timezone,
        receipt_prefix=gym.receipt_prefix,
    )


@router.patch("/operations", response_model=OperationsSettingsResponse)
async def update_operations_settings(
    payload: OperationsSettingsUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_role(UserRole.owner)),
) -> OperationsSettingsResponse:
    gym = await load_gym_settings(db)
    if payload.grace_days is not None:
        gym.grace_days = payload.grace_days
    if payload.receipt_prefix is not None:
        gym.receipt_prefix = payload.receipt_prefix
    await db.commit()
    await db.refresh(gym)
    return OperationsSettingsResponse(
        grace_days=gym.grace_days,
        timezone=gym.timezone,
        receipt_prefix=gym.receipt_prefix,
    )


# ─── Profile ─────────────────────────────────────────────────────────────────

@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(
    current_user: UserStaff = Depends(get_current_staff),
) -> UserProfileResponse:
    return UserProfileResponse(
        id=str(current_user.id),
        full_name=current_user.full_name,
        email=current_user.email,
        role=current_user.role.value,
    )


@router.patch("/profile", response_model=UserProfileResponse)
async def update_profile(
    payload: UserProfileUpdate,
    # Both get_current_staff and db resolve to the same get_tenant_db_from_token
    # generator — FastAPI deduplicates by function identity, so current_user and
    # db share one session and mutations on current_user are committed via db.
    current_user: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
) -> UserProfileResponse:
    # Password change validation
    if payload.new_password:
        if not payload.current_password:
            raise HTTPException(
                status_code=400,
                detail="Se requiere la contraseña actual para cambiar la contraseña",
            )
        if not verify_password(payload.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
        current_user.hashed_password = hash_password(payload.new_password)

    if payload.full_name is not None:
        current_user.full_name = payload.full_name

    if payload.email is not None and payload.email != current_user.email:
        existing = await db.execute(
            select(UserStaff).where(UserStaff.email == payload.email)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email ya está en uso")
        current_user.email = payload.email

    await db.commit()
    await db.refresh(current_user)

    return UserProfileResponse(
        id=str(current_user.id),
        full_name=current_user.full_name,
        email=current_user.email,
        role=current_user.role.value,
    )


# ─── Gym ─────────────────────────────────────────────────────────────────────

@router.get("/gym", response_model=GymSettingsResponse)
async def get_gym_settings(
    tenant: Tenant = Depends(get_master_tenant),
) -> GymSettingsResponse:
    return GymSettingsResponse(
        name=tenant.name,
        phone=tenant.phone,
        address=tenant.address,
        city=tenant.city,
        country=tenant.country,
        logo_url=tenant.logo_url,
        plan=tenant.plan.value if tenant.plan else None,
        operating_hours=tenant.operating_hours,
    )


@router.patch("/gym", response_model=GymSettingsResponse)
async def update_gym_settings(
    payload: GymSettingsUpdate,
    tenant: Tenant = Depends(check_tenant_active),
    master_db: AsyncSession = Depends(get_master_db),
) -> GymSettingsResponse:
    if payload.name is not None:
        tenant.name = payload.name
    if payload.phone is not None:
        tenant.phone = payload.phone
    if payload.address is not None:
        tenant.address = payload.address
    if payload.city is not None:
        tenant.city = payload.city
    if payload.country is not None:
        tenant.country = payload.country
    if payload.logo_url is not None:
        tenant.logo_url = payload.logo_url
    if payload.operating_hours is not None:
        tenant.operating_hours = payload.operating_hours

    await master_db.commit()
    await master_db.refresh(tenant)

    return GymSettingsResponse(
        name=tenant.name,
        phone=tenant.phone,
        address=tenant.address,
        city=tenant.city,
        country=tenant.country,
        logo_url=tenant.logo_url,
        plan=tenant.plan.value if tenant.plan else None,
        operating_hours=tenant.operating_hours,
    )


# ─── Recaudo y datos fiscales ────────────────────────────────────────────────

class TransferAccount(BaseModel):
    type: str = Field(pattern="^(nequi|daviplata|bancolombia|bank)$")
    label: str = Field(min_length=1, max_length=60)
    account_number: str = Field(min_length=3, max_length=40)
    holder_name: str = Field(min_length=1, max_length=120)


class BillingSettingsResponse(BaseModel):
    transfer_accounts: list[TransferAccount]
    legal_name: str | None
    nit: str | None
    tax_regime: str | None


class BillingSettingsUpdate(BaseModel):
    transfer_accounts: list[TransferAccount] | None = Field(default=None, max_length=10)
    legal_name: str | None = Field(default=None, max_length=200)
    nit: str | None = Field(default=None, max_length=30)
    tax_regime: str | None = Field(default=None, max_length=50)


def _billing_response(gym) -> BillingSettingsResponse:
    return BillingSettingsResponse(
        transfer_accounts=[TransferAccount(**a) for a in (gym.transfer_accounts or [])],
        legal_name=gym.legal_name,
        nit=gym.nit,
        tax_regime=gym.tax_regime,
    )


# Lectura para todo el staff: recepción necesita las cuentas en el POS
@router.get("/billing", response_model=BillingSettingsResponse)
async def get_billing_settings(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
) -> BillingSettingsResponse:
    gym = await load_gym_settings(db)
    return _billing_response(gym)


@router.patch("/billing", response_model=BillingSettingsResponse)
async def update_billing_settings(
    payload: BillingSettingsUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(require_role(UserRole.owner)),
) -> BillingSettingsResponse:
    gym = await load_gym_settings(db)
    if payload.transfer_accounts is not None:
        gym.transfer_accounts = [a.model_dump() for a in payload.transfer_accounts]
    if payload.legal_name is not None:
        gym.legal_name = payload.legal_name
    if payload.nit is not None:
        gym.nit = payload.nit
    if payload.tax_regime is not None:
        gym.tax_regime = payload.tax_regime
    await db.commit()
    await db.refresh(gym)
    return _billing_response(gym)


# ─── Integraciones (Wompi, WhatsApp) — secretos cifrados ─────────────────────

class IntegrationsResponse(BaseModel):
    wompi_public_key: str | None
    wompi_configured: bool
    whatsapp_phone_number_id: str | None
    whatsapp_configured: bool


class IntegrationsUpdate(BaseModel):
    wompi_public_key: str | None = None
    wompi_private_key: str | None = None
    wompi_events_secret: str | None = None
    wompi_integrity_secret: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_access_token: str | None = None


def _integrations_response(gym) -> "IntegrationsResponse":
    return IntegrationsResponse(
        wompi_public_key=gym.wompi_public_key,
        wompi_configured=bool(gym.wompi_public_key and gym.wompi_private_key and gym.wompi_events_secret),
        whatsapp_phone_number_id=gym.whatsapp_phone_number_id,
        whatsapp_configured=bool(gym.whatsapp_phone_number_id and gym.whatsapp_access_token),
    )


@router.get("/integrations", response_model=IntegrationsResponse)
async def get_integrations(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(require_role(UserRole.owner)),
) -> IntegrationsResponse:
    gym = await load_gym_settings(db)
    return _integrations_response(gym)


@router.patch("/integrations", response_model=IntegrationsResponse)
async def update_integrations(
    payload: IntegrationsUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(require_role(UserRole.owner)),
) -> IntegrationsResponse:
    from app.services.gym_settings import set_secret
    gym = await load_gym_settings(db)
    # Claves públicas/ids en claro; secretos cifrados.
    if payload.wompi_public_key is not None:
        gym.wompi_public_key = payload.wompi_public_key
    if payload.whatsapp_phone_number_id is not None:
        gym.whatsapp_phone_number_id = payload.whatsapp_phone_number_id
    for field in ("wompi_private_key", "wompi_events_secret", "wompi_integrity_secret", "whatsapp_access_token"):
        value = getattr(payload, field)
        if value is not None:
            set_secret(gym, field, value)
    await db.commit()
    await db.refresh(gym)
    return _integrations_response(gym)


# ─── Notifications ────────────────────────────────────────────────────────────

_DEFAULT_PREFS = NotificationPreferences()


@router.get("/notifications", response_model=NotificationPreferences)
async def get_notification_prefs(
    current_user: UserStaff = Depends(get_current_staff),
) -> NotificationPreferences:
    if not current_user.notification_prefs:
        return _DEFAULT_PREFS
    return NotificationPreferences(**current_user.notification_prefs)


@router.patch("/notifications", response_model=NotificationPreferences)
async def update_notification_prefs(
    payload: NotificationPreferencesUpdate,
    current_user: UserStaff = Depends(get_current_staff),
    db: AsyncSession = Depends(get_tenant_db_from_token),
) -> NotificationPreferences:
    # Merge partial update into existing prefs (preserves fields not in payload)
    current = NotificationPreferences(**(current_user.notification_prefs or {}))
    updates = payload.model_dump(exclude_none=True)
    merged = current.model_dump()
    merged.update(updates)
    current_user.notification_prefs = merged
    await db.commit()
    await db.refresh(current_user)
    return NotificationPreferences(**current_user.notification_prefs)
