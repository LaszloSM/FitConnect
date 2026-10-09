"""Planes de la app: generar (con IA o automático), fila, créditos y los
planes guardados."""
import asyncio
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.app_db import app_session
from app.db.master_session import get_master_db
from app.models.app import PlanJob, SavedPlan
from app.models.master.app_user import AppUser
from app.services import app_accounts, auto_plans, credits, plan_generator, plans

router = APIRouter(prefix="/me", tags=["app"], dependencies=[Depends(get_app_user)])
#: Referencias a las tareas en segundo plano: sin ellas el recolector las puede cortar.
_background: set[asyncio.Task] = set()

HELP_EATING = ("Lo que cuentas merece acompañamiento de un profesional, no un plan de comidas automático. "
               "Puedes pedir cita en tu EPS o llamar a la línea de salud mental del Ministerio de Salud: 192, "
               "opción 4. Si estás en peligro, llama al 123.")
HELP_MEDICAL = ("Con embarazo, lactancia, una enfermedad crónica o una lesión, el plan lo debe hacer un "
                "profesional de la salud que te conozca. Aquí puedes seguir registrando lo que comes y entrenas.")


class MealsReq(BaseModel):
    meals_per_day: int = Field(default=3, ge=3, le=5)
    restrictions: list[Literal["vegetarian", "no_dairy", "no_pork", "no_fish"]] = Field(default_factory=list, max_length=4)


class TrainingReq(BaseModel):
    days_per_week: int = Field(default=3, ge=2, le=6)
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    place: Literal["gym", "home"] = "gym"
    minutes: Literal[30, 45, 60, 90] = 45
    focus: Literal["strength", "hypertrophy", "general", "fat_loss"] = "general"


class Screening(BaseModel):
    """Preguntas previas. Reemplazan al tamizaje del chat: con una respuesta
    afirmativa no se genera el plan y se orienta a un profesional."""
    eating_disorder: bool = False
    medical: bool = False


class GenerateIn(BaseModel):
    id: uuid.UUID
    kind: Literal["meals", "training"]
    engine: Literal["ai", "auto"] = "auto"
    meals: Optional[MealsReq] = None
    training: Optional[TrainingReq] = None
    screening: Screening = Field(default_factory=Screening)


async def _options(user: AppUser, master: AsyncSession, adb: AsyncSession) -> dict:
    consents = await app_accounts.consents(master, user.id)
    person = await plans.person(user, master, adb)
    meals_block = None
    if not consents["health"]:
        meals_block = "Para armar un plan de comidas autoriza el uso de tus datos de salud."
    elif person.targets is None:
        meals_block = "Completa tus medidas y tu objetivo en Mis medidas para calcular tus metas."
    age_block = None
    if person.age is None:
        age_block = "Agrega tu fecha de nacimiento en Mis medidas."
    elif person.age < plans.MIN_AGE:
        age_block = "Los planes son para mayores de 18 años. Tu entrenador puede acompañarte en el gimnasio."
    return {
        "ai_available": bool(settings.gemini_api_key), "ai_consent": consents.get("ai_plans", False),
        "credits": await credits.summary(adb, user.id),
        "meals_blocked": age_block or meals_block, "training_blocked": age_block,
        "restriction_labels": auto_plans.RESTRICTION_LABELS, "parq_flag": person.parq_flag,
        "targets": person.targets,
    }


@router.get("/plans/options")
async def plan_options(user: AppUser = Depends(get_app_user), master: AsyncSession = Depends(get_master_db)):
    async with app_session() as adb:
        out = await _options(user, master, adb)
        await adb.commit()
        return out


@router.get("/credits")
async def my_credits(user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        out = await credits.summary(adb, user.id)
        await adb.commit()
        return out


@router.post("/plans/generate")
@limiter.limit("10/minute")
async def generate_plan(request: Request, payload: GenerateIn, user: AppUser = Depends(get_app_user),
                        master: AsyncSession = Depends(get_master_db)):
    """Automático: responde el plan de una vez. Con IA: cobra un crédito, deja
    el pedido en fila y responde 202; la app consulta `/plans/jobs/{id}`.
    Reenviar el mismo `id` no cobra dos veces."""
    if payload.screening.eating_disorder and payload.kind == "meals":
        raise HTTPException(status_code=422, detail=HELP_EATING)
    if payload.screening.medical:
        raise HTTPException(status_code=422, detail=HELP_MEDICAL)
    req = (payload.meals or MealsReq()).model_dump() if payload.kind == "meals" else (payload.training or TrainingReq()).model_dump()
    async with app_session() as adb:
        existing = await adb.get(PlanJob, payload.id)
        if existing is not None:
            if existing.app_user_id != user.id:
                raise HTTPException(status_code=409, detail="Ese pedido ya existe")
            plan = await adb.get(SavedPlan, existing.plan_id) if existing.plan_id else None
            pos = await plan_generator.queue_position(adb, existing) if existing.status == "queued" else None
            return plan_generator.job_out(existing, pos, plan)
        opts = await _options(user, master, adb)
        blocked = opts["meals_blocked"] if payload.kind == "meals" else opts["training_blocked"]
        if blocked:
            raise HTTPException(status_code=422, detail=blocked)
        person = await plans.person(user, master, adb)
        if payload.engine == "auto":
            data = await plan_generator.auto_plan(adb, user.id, person, payload.kind, req)
            p = await plan_generator.save_plan(adb, user.id, payload.kind, req, "auto", data)
            job = PlanJob(id=payload.id, app_user_id=user.id, kind=payload.kind, request=req, status="done",
                          engine="auto", plan_id=p.id)
            adb.add(job)
            await adb.commit()
            return plan_generator.job_out(job, None, p)
        if not settings.gemini_api_key:
            raise HTTPException(status_code=503, detail="La IA no está activa en este servidor. Genera el plan automático, que es gratis.")
        if not opts["ai_consent"]:
            raise HTTPException(status_code=403, detail="Para usar la IA autoriza el envío de tus datos anónimos en Perfil › Autorizaciones.")
        job = PlanJob(id=payload.id, app_user_id=user.id, kind=payload.kind, request=req, status="queued")
        adb.add(job)
        try:
            await credits.spend(adb, user.id, str(job.id))
        except credits.NoCredits:
            raise HTTPException(status_code=402, detail="Te quedaste sin créditos de IA esta semana. El plan automático es gratis.") from None
        await adb.commit()
        pos = await plan_generator.queue_position(adb, job)
    task = asyncio.create_task(plan_generator.kick())
    _background.add(task)
    task.add_done_callback(_background.discard)
    return JSONResponse(status_code=202, content=plan_generator.job_out(job, pos))


@router.get("/plans/jobs/{job_id}")
async def plan_job(job_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        job = await adb.get(PlanJob, job_id)
        if job is None or job.app_user_id != user.id:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")
        plan = await adb.get(SavedPlan, job.plan_id) if job.plan_id else None
        pos = await plan_generator.queue_position(adb, job) if job.status == "queued" else None
        return plan_generator.job_out(job, pos, plan)


@router.get("/plans")
async def list_plans(user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        rows = (await adb.execute(select(SavedPlan).where(SavedPlan.app_user_id == user.id)
                                  .order_by(desc(SavedPlan.created_at)))).scalars().all()
    return [plans.plan_out(p) for p in rows]


async def _plan(adb: AsyncSession, plan_id: uuid.UUID, user: AppUser) -> SavedPlan:
    p = await adb.get(SavedPlan, plan_id)
    if p is None or p.app_user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return p


@router.get("/plans/{plan_id}")
async def get_plan(plan_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        return plans.plan_out(await _plan(adb, plan_id, user))


class PlanPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    active: Optional[bool] = None
    data: Optional[dict] = None


@router.put("/plans/{plan_id}")
async def edit_plan(plan_id: uuid.UUID, payload: PlanPatch, user: AppUser = Depends(get_app_user),
                    master: AsyncSession = Depends(get_master_db)):
    """La persona edita su plan: pasa por la misma validación que los generados,
    y las cifras de las comidas se recalculan desde la base."""
    async with app_session() as adb:
        p = await _plan(adb, plan_id, user)
        if payload.data is not None:
            try:
                if p.kind == "meals":
                    person = await plans.person(user, master, adb)
                    ids = [i.get("food_id") for m in payload.data.get("meals") or [] for i in (m.get("items") or [])]
                    allowed = await plans.foods_by_ids(adb, user.id, ids)
                    new = plans.validate_meals({**payload.data, "targets": p.data.get("targets")}, person.min_kcal, allowed)
                else:
                    new = plans.validate_training(payload.data)
            except plans.PlanError as e:
                raise HTTPException(status_code=422, detail=str(e)) from None
            p.data = {**new, "engine": p.data.get("engine"), "edited": True}
        if payload.title is not None:
            p.title = payload.title.strip()
        if payload.active is not None:
            p.active = payload.active
        await adb.commit()
        return plans.plan_out(p)


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        await adb.delete(await _plan(adb, plan_id, user))
        await adb.commit()
    return {"ok": True}
