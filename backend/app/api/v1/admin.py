from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.api.deps import security, require_perm
from app.core import permissions as perm
from app.core.config import settings
from app.core.security import decode_token
from app.db.master_session import MasterSessionLocal
from app.models.master.tenant import Tenant
from app.services.jobs import _daily_tenant_tasks, _reconcile_tenant_payments, _process_tenant_outbox

router = APIRouter(prefix="/admin", tags=["admin"])

_PER_TENANT_JOBS = {
    "expire_memberships": _daily_tenant_tasks,
    "reconcile_payments": _reconcile_tenant_payments,
    "process_outbox": _process_tenant_outbox,
}


@router.post("/run-job/{job_name}", dependencies=[Depends(require_perm(perm.JOBS_RUN))])
async def run_job(
    job_name: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Dispara un job del scheduler sobre el tenant del token. Solo en desarrollo.
    Llama directamente a la función por-tenant para evitar contención del advisory lock."""
    if settings.environment != "development":
        raise HTTPException(status_code=404, detail="No disponible")

    task = _PER_TENANT_JOBS.get(job_name)
    if not task:
        raise HTTPException(status_code=404, detail=f"Job desconocido. Disponibles: {', '.join(_PER_TENANT_JOBS)}")

    payload = decode_token(credentials.credentials)
    db_name = payload.get("db_name", "")

    async with MasterSessionLocal() as master_db:
        tenant = (await master_db.execute(
            select(Tenant).where(Tenant.db_name == db_name)
        )).scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=400, detail="Tenant no encontrado")

    connection_string = settings.tenant_database_url_template.replace("{db_name}", db_name)
    engine = create_async_engine(connection_string, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            await task(session, tenant)
    finally:
        await engine.dispose()

    return {"ran": job_name}
