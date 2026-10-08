"""Asistente y planes guardados de la app."""
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.timeutil import today_bogota
from app.db.app_db import app_session
from app.db.master_session import get_master_db
from app.models.app import AppProfile, AssistantMessage, SavedPlan
from app.models.master.app_user import AppUser
from app.services import assistant, nutrition

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me", tags=["app"], dependencies=[Depends(get_app_user)])


async def _availability(user: AppUser, adb: AsyncSession) -> dict:
    if not settings.anthropic_api_key:
        return {"available": False, "reason": "off", "message": "El asistente todavía no está disponible."}
    p = await adb.get(AppProfile, user.id)
    if not p or not p.birth_date:
        return {"available": False, "reason": "birth_date",
                "message": "Para usar el asistente agrega tu fecha de nacimiento en Mis medidas."}
    if nutrition.age_on(p.birth_date, today_bogota()) < assistant.MIN_AGE:
        return {"available": False, "reason": "age",
                "message": "El asistente es para mayores de 18 años. Tu entrenador puede acompañarte en el gimnasio."}
    return {"available": True}


@router.get("/assistant")
async def assistant_state(user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        state = await _availability(user, adb)
        rows = (await adb.execute(select(AssistantMessage).where(AssistantMessage.app_user_id == user.id)
                                  .order_by(desc(AssistantMessage.created_at)).limit(50))).scalars().all()
        used = await assistant.messages_today(adb, user.id)
    return {**state, "limit": settings.assistant_daily_limit, "used_today": used,
            "messages": [{"id": str(m.id), "role": m.role, "text": m.text, "plan_ids": m.plan_ids or [],
                          "created_at": m.created_at.isoformat()} for m in reversed(rows)]}


class AskIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/assistant/messages")
@limiter.limit("10/minute")
async def ask(request: Request, payload: AskIn, user: AppUser = Depends(get_app_user),
              master: AsyncSession = Depends(get_master_db)):
    async with app_session() as adb:
        state = await _availability(user, adb)
        if not state["available"]:
            raise HTTPException(status_code=503 if state["reason"] == "off" else 403, detail=state["message"])
        if await assistant.messages_today(adb, user.id) >= settings.assistant_daily_limit:
            raise HTTPException(status_code=429, detail="Llegaste al límite de mensajes de hoy. Mañana seguimos.")
        try:
            return await assistant.reply(user, payload.text.strip(), master, adb)
        except HTTPException:
            raise
        except Exception:
            logger.exception("El asistente falló")
            await adb.rollback()
            raise HTTPException(status_code=502, detail="El asistente no respondió. Intenta de nuevo en un momento.") from None


@router.delete("/assistant/messages")
async def clear_conversation(user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        await adb.execute(delete(AssistantMessage).where(AssistantMessage.app_user_id == user.id))
        await adb.commit()
    return {"ok": True}


@router.get("/plans")
async def list_plans(user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        rows = (await adb.execute(select(SavedPlan).where(SavedPlan.app_user_id == user.id)
                                  .order_by(desc(SavedPlan.created_at)))).scalars().all()
    return [assistant.plan_out(p) for p in rows]


async def _plan(adb: AsyncSession, plan_id: uuid.UUID, user: AppUser) -> SavedPlan:
    p = await adb.get(SavedPlan, plan_id)
    if p is None or p.app_user_id != user.id:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return p


@router.get("/plans/{plan_id}")
async def get_plan(plan_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        return assistant.plan_out(await _plan(adb, plan_id, user))


class PlanPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    active: Optional[bool] = None
    data: Optional[dict] = None


@router.put("/plans/{plan_id}")
async def edit_plan(plan_id: uuid.UUID, payload: PlanPatch, user: AppUser = Depends(get_app_user),
                    master: AsyncSession = Depends(get_master_db)):
    """La persona edita su plan: pasa por la misma validación que los del asistente."""
    async with app_session() as adb:
        p = await _plan(adb, plan_id, user)
        if payload.data is not None:
            min_kcal = None
            if p.kind == "meals":
                min_kcal = (await assistant.build_context(user, master, adb)).min_kcal
            try:
                p.data = assistant.validate_plan(p.kind, payload.data, min_kcal)
            except assistant.PlanError as e:
                raise HTTPException(status_code=422, detail=str(e)) from None
        if payload.title is not None:
            p.title = payload.title.strip()
        if payload.active is not None:
            p.active = payload.active
        await adb.commit()
        return assistant.plan_out(p)


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        await adb.delete(await _plan(adb, plan_id, user))
        await adb.commit()
    return {"ok": True}
