from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, get_current_staff
from app.models.tenant.member import Member
from app.models.tenant.member_plan import MemberPlan

router = APIRouter(prefix="/onboarding", tags=["onboarding"], dependencies=[Depends(get_current_staff)])


async def _exists(db: AsyncSession, model) -> bool:
    return (await db.execute(select(model.id).limit(1))).scalar() is not None


@router.get("/status")
async def onboarding_status(db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Progreso de configuración del gym para el checklist de onboarding."""
    has_plan = await _exists(db, MemberPlan)
    has_member = await _exists(db, Member)

    return {
        "has_plan": has_plan,
        "has_member": has_member,
        "done": has_plan and has_member,
    }
