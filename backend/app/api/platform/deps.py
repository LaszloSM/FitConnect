from typing import AsyncGenerator, Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import client_ip
from app.core.security import decode_platform_token
from app.db.master_session import MasterSessionLocal
from app.models.master.platform import PlatformAdmin, PlatformAuditLog
from app.services.account_security import is_revoked

bearer = HTTPBearer(auto_error=False)


def check_ip(request: Request) -> None:
    allowed = settings.platform_allowed_ips
    if allowed and client_ip(request) not in allowed:
        raise HTTPException(status_code=403, detail="Acceso no permitido desde esta red")


async def master_db() -> AsyncGenerator[AsyncSession, None]:
    async with MasterSessionLocal() as session:
        yield session


async def current_admin(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(master_db),
) -> PlatformAdmin:
    check_ip(request)
    if credentials is None:
        raise HTTPException(status_code=401, detail="Inicia sesión")
    claims = decode_platform_token(credentials.credentials, scope="platform")
    if await is_revoked(claims.get("jti")):
        raise HTTPException(status_code=401, detail="Sesión cerrada")
    admin = await db.get(PlatformAdmin, claims["sub"])
    if admin is None or not admin.is_active or not admin.totp_enabled:
        raise HTTPException(status_code=401, detail="Cuenta no válida")
    request.state.platform_claims = claims
    return admin


def log(db: AsyncSession, request: Request, admin: Optional[PlatformAdmin], action: str,
        tenant_id=None, details: Optional[dict] = None, email: Optional[str] = None) -> None:
    db.add(PlatformAuditLog(
        admin_id=admin.id if admin else None, admin_email=admin.email if admin else email,
        action=action, tenant_id=tenant_id, details=details or {}, ip=client_ip(request),
    ))
