import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
    get_tenant_slug,
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
    cash_shifts_enabled: bool


class OperationsSettingsUpdate(BaseModel):
    grace_days: int | None = Field(default=None, ge=0, le=30)
    receipt_prefix: str | None = Field(default=None, min_length=1, max_length=10)
    cash_shifts_enabled: bool | None = None


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
        cash_shifts_enabled=gym.cash_shifts_enabled,
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
    if payload.cash_shifts_enabled is not None:
        gym.cash_shifts_enabled = payload.cash_shifts_enabled
    await db.commit()
    await db.refresh(gym)
    return OperationsSettingsResponse(
        grace_days=gym.grace_days,
        timezone=gym.timezone,
        receipt_prefix=gym.receipt_prefix,
        cash_shifts_enabled=gym.cash_shifts_enabled,
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


_ALLOWED_LOGO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_MAX_LOGO_BYTES = 2 * 1024 * 1024


@router.post("/gym/logo", response_model=GymSettingsResponse)
async def upload_gym_logo(
    file: UploadFile = File(...),
    tenant: Tenant = Depends(check_tenant_active),
    master_db: AsyncSession = Depends(get_master_db),
):
    """Sube el logo del gym a S3 y persiste su URL (reemplaza el campo de URL manual)."""
    from app.services.storage import upload_image

    ext = _ALLOWED_LOGO_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Formato no soportado (usa JPG, PNG o WEBP)")
    data = await file.read()
    if len(data) > _MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="El logo supera 2 MB")

    key = f"gyms/{tenant.slug}/logo.{ext}"
    url = await upload_image(data, key, file.content_type)
    tenant.logo_url = url
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
    id: str | None = Field(default=None, max_length=36)
    type: str = Field(pattern="^(nequi|daviplata|bancolombia|bank)$")
    label: str = Field(min_length=1, max_length=60)
    account_number: str = Field(min_length=3, max_length=40)
    holder_name: str = Field(min_length=1, max_length=120)
    # Llave Bre-B (pagos inmediatos) y QR del banco para mostrar al cobrar
    breb_key: str | None = Field(default=None, max_length=80)
    qr_url: str | None = Field(default=None, max_length=500)
    is_active: bool = True


class BillingSettingsResponse(BaseModel):
    transfer_accounts: list[TransferAccount]
    legal_name: str | None
    nit: str | None
    tax_regime: str | None
    transfer_auto_void_hours: int = 24


class BillingSettingsUpdate(BaseModel):
    transfer_accounts: list[TransferAccount] | None = Field(default=None, max_length=10)
    legal_name: str | None = Field(default=None, max_length=200)
    nit: str | None = Field(default=None, max_length=30)
    tax_regime: str | None = Field(default=None, max_length=50)
    transfer_auto_void_hours: int | None = Field(default=None, ge=0, le=720)


def _billing_response(gym) -> BillingSettingsResponse:
    from app.services.payments import transfer_accounts
    from app.services.storage import resolve_media_url
    return BillingSettingsResponse(
        transfer_accounts=[TransferAccount(**{**a, "qr_url": resolve_media_url(a.get("qr_url"))}) for a in transfer_accounts(gym)],
        legal_name=gym.legal_name,
        nit=gym.nit,
        tax_regime=gym.tax_regime,
        transfer_auto_void_hours=gym.transfer_auto_void_hours,
    )


# Lectura para todo el staff: recepción necesita las cuentas en el POS
@router.get("/billing", response_model=BillingSettingsResponse)
async def get_billing_settings(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(require_role(UserRole.owner, UserRole.admin)),
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
        # Conservar id y QR de las cuentas existentes al reenviar la lista
        previous = {a["id"]: a for a in _accounts(gym)}
        accounts = []
        for a in payload.transfer_accounts:
            data = a.model_dump()
            if not data.get("id"):
                data["id"] = str(uuid.uuid4())
            old = previous.get(data["id"])
            if old and (not data.get("qr_url") or data["qr_url"].startswith("http")):
                data["qr_url"] = old.get("qr_url")
            accounts.append(data)
        gym.transfer_accounts = accounts
    if payload.transfer_auto_void_hours is not None:
        gym.transfer_auto_void_hours = payload.transfer_auto_void_hours
    if payload.legal_name is not None:
        gym.legal_name = payload.legal_name
    if payload.nit is not None:
        gym.nit = payload.nit
    if payload.tax_regime is not None:
        gym.tax_regime = payload.tax_regime
    await db.commit()
    await db.refresh(gym)
    return _billing_response(gym)


def _accounts(gym) -> list[dict]:
    from app.services.payments import transfer_accounts
    return transfer_accounts(gym)


_QR_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@router.post("/billing/transfer-accounts/{account_id}/qr", response_model=BillingSettingsResponse)
async def upload_transfer_account_qr(
    account_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(require_role(UserRole.owner)),
    slug: str = Depends(get_tenant_slug),
) -> BillingSettingsResponse:
    """Sube el QR del banco/Nequi de una cuenta de recaudo."""
    from app.services.storage import upload_image

    ext = _QR_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Formato no soportado (usa JPG, PNG o WEBP)")
    data = await file.read()
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen supera 3 MB")
    gym = await load_gym_settings(db)
    accounts = _accounts(gym)
    target = next((a for a in accounts if a["id"] == account_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Cuenta de recaudo no encontrada")
    target["qr_url"] = await upload_image(data, f"transfer-qr/{slug}/{account_id}.{ext}", file.content_type)
    gym.transfer_accounts = accounts
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
