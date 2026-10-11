"""Entrada a la app móvil con un código por correo (sin contraseñas que olvidar)."""
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.master_session import get_master_db
from app.models.master.app_user import AppUser
from app.services import app_accounts, emails, mailer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app/auth", tags=["app"])


class CodeRequest(BaseModel):
    email: str = Field(max_length=255)


class VerifyRequest(BaseModel):
    email: str = Field(max_length=255)
    code: str = Field(max_length=12)
    device_name: str | None = Field(default=None, max_length=120)
    #: Solo la primera vez: aceptar términos y política de datos.
    accept_terms: bool = False
    full_name: str | None = Field(default=None, max_length=255)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(max_length=200)


@router.post("/code")
@limiter.limit("5/minute")
async def request_code(request: Request, payload: CodeRequest, background: BackgroundTasks,
                       db: AsyncSession = Depends(get_master_db)):
    """Siempre responde lo mismo: no confirma si el correo tiene cuenta."""
    email = app_accounts.normalize_email(payload.email)
    code = await app_accounts.request_code(db, email)
    if code:
        if settings.environment == "development":
            logger.info("Código de la app para %s: %s", email, code)
        background.add_task(mailer.send_email, email, emails.app_login_code(code, app_accounts.CODE_MINUTES))
    return {"ok": True, "expires_in": app_accounts.CODE_MINUTES * 60}


@router.post("/verify")
@limiter.limit("10/minute")
async def verify(request: Request, payload: VerifyRequest, db: AsyncSession = Depends(get_master_db)):
    email = app_accounts.normalize_email(payload.email)
    user = (await db.execute(select(AppUser).where(AppUser.email == email))).scalar_one_or_none()
    if user is None and not payload.accept_terms:
        # Se revisa el código sin gastarlo: la app muestra los términos y reintenta.
        if not await app_accounts.check_code(db, email, payload.code, consume=False):
            raise HTTPException(status_code=400, detail="Código incorrecto o vencido")
        raise HTTPException(status_code=428, detail={
            "code": "terms_required", "terms_version": settings.app_terms_version,
            "message": "Para crear tu cuenta acepta los términos y la política de datos.",
        })
    if not await app_accounts.check_code(db, email, payload.code, consume=True):
        raise HTTPException(status_code=400, detail="Código incorrecto o vencido")
    created = user is None
    if created:
        user = AppUser(email=email, full_name=(payload.full_name or "").strip() or None,
                       terms_version=settings.app_terms_version, terms_accepted_at=datetime.utcnow())
        db.add(user)
        await db.flush()
    tokens = await app_accounts.issue_session(db, user, payload.device_name)
    await db.commit()
    return {**tokens, "created": created}


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh(request: Request, payload: RefreshRequest, db: AsyncSession = Depends(get_master_db)):
    return await app_accounts.rotate_session(db, payload.refresh_token)


@router.post("/logout")
async def logout(payload: RefreshRequest, db: AsyncSession = Depends(get_master_db)):
    await app_accounts.revoke_session(db, payload.refresh_token)
    return {"ok": True}
