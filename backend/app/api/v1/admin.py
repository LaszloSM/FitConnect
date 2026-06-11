from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_role
from app.core.config import settings
from app.models.tenant.user_staff import UserRole
from app.services.jobs import JOBS

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/run-job/{job_name}", dependencies=[Depends(require_role(UserRole.owner))])
async def run_job(job_name: str):
    """Dispara un job del scheduler manualmente. Solo en desarrollo."""
    if settings.environment != "development":
        raise HTTPException(status_code=404, detail="No disponible")
    job = JOBS.get(job_name)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job desconocido. Disponibles: {', '.join(JOBS)}")
    await job()
    return {"ran": job_name}
