from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, get_current_staff
from app.models.tenant.checkin import CheckIn
from app.models.tenant.member import Member
from app.models.tenant.member_plan import MemberPlan
from app.services.gym_settings import get_gym_settings, secret

router = APIRouter(prefix="/onboarding", tags=["onboarding"], dependencies=[Depends(get_current_staff)])


async def _exists(db: AsyncSession, model) -> bool:
    return (await db.execute(select(model.id).limit(1))).scalar() is not None


@router.get("/status")
async def onboarding_status(db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Progreso de configuración del gym para el checklist de onboarding.
    `done` = no falta ningún paso esencial (cobros en línea es opcional)."""
    gym = await get_gym_settings(db)
    has_plan = await _exists(db, MemberPlan)
    has_member = await _exists(db, Member)
    has_checkin = await _exists(db, CheckIn)
    has_online_payments = bool(secret(gym, "wompi_private_key"))

    essential = [has_plan, has_member, has_checkin]
    return {
        "has_plan": has_plan,
        "has_member": has_member,
        "has_checkin": has_checkin,
        "has_online_payments": has_online_payments,
        "done": all(essential),
    }
