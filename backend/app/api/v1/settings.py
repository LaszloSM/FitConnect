from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import (
    get_current_staff,
    get_master_tenant,
    get_master_db,
    get_tenant_db_from_token,
    check_tenant_active,
)
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
        logo_url=tenant.logo_url,
        plan=tenant.plan.value if tenant.plan else None,
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
    if payload.logo_url is not None:
        tenant.logo_url = payload.logo_url

    await master_db.commit()
    await master_db.refresh(tenant)

    return GymSettingsResponse(
        name=tenant.name,
        phone=tenant.phone,
        address=tenant.address,
        city=tenant.city,
        logo_url=tenant.logo_url,
        plan=tenant.plan.value if tenant.plan else None,
    )


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
