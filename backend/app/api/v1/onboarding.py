from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, get_current_staff
from app.core.timeutil import utcnow_naive
from app.models.tenant.member import Member, is_business_member
from app.models.tenant.member_plan import MemberPlan
from app.services.gym_settings import get_gym_settings
from app.services.staff_member import STAFF_PLAN_NAME

router = APIRouter(prefix="/onboarding", tags=["onboarding"], dependencies=[Depends(get_current_staff)])


@router.get("/status")
async def onboarding_status(db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Progreso de configuración del gym para el checklist y el tour de bienvenida.

    Solo cuenta lo que el dueño crea. El sistema da de alta por su cuenta el plan
    de cortesía del equipo y la ficha de socio del propio dueño; darlos por
    progreso suyo le diría que ya tiene plan y socio antes de haber hecho nada.
    """
    gym = await get_gym_settings(db)
    has_plan = (await db.execute(
        select(MemberPlan.id).where(MemberPlan.name != STAFF_PLAN_NAME).limit(1)
    )).scalar() is not None
    has_member = (await db.execute(
        select(Member.id).where(is_business_member()).limit(1)
    )).scalar() is not None

    return {
        "has_plan": has_plan,
        "has_member": has_member,
        "done": has_plan and has_member,
        "tour_completed": gym.tour_completed_at is not None,
    }


@router.post("/tour-complete")
async def complete_tour(db: AsyncSession = Depends(get_tenant_db_from_token)):
    """Marca el tour de bienvenida como visto (completado o saltado)."""
    gym = await get_gym_settings(db)
    if gym.tour_completed_at is None:
        gym.tour_completed_at = utcnow_naive()
        await db.commit()
    return {"tour_completed": True}
