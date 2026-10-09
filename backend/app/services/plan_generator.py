"""Planes con IA en modo estructurado (Gemini).

El modelo nunca conversa con la persona: recibe un perfil anónimo y las metas
ya calculadas, y devuelve SOLO JSON con el esquema que se le exige
(`responseSchema`). Lo que devuelve pasa por los mismos validadores que
cualquier plan (`services/plans.py`):

- Comidas: solo puede elegir alimentos de una lista de la base (enum de
  claves); el servidor calcula calorías y macros y ajusta el día a la meta.
- Entreno: series, repeticiones y descansos dentro de rangos.

Cuota: el plan gratis de Google limita peticiones por minuto y por día (y
las cambia sin aviso). Un contador en Redis se queda por debajo de
`gemini_rpm`/`gemini_rpd`; lo que no cabe espera en `plan_jobs` y lo procesa
el worker. Si el modelo falla dos veces, o la cuota no se libera, el pedido
termina con el plan automático y el crédito se devuelve.

Privacidad: en el plan gratis Google puede usar lo que se le envía para
mejorar sus productos, por eso se manda `Person.anonymous()` y nada más, y
la persona lo autoriza aparte (consentimiento `ai_plans`).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.timeutil import today_bogota, utcnow_naive
from app.models.app import Food, PlanJob, SavedPlan
from app.services import auto_plans, credits, plans, portion_fit

logger = logging.getLogger(__name__)
PACIFIC = ZoneInfo("America/Los_Angeles")  # la cuota diaria de Google se reinicia a medianoche del Pacífico
MAX_AI_ATTEMPTS = 2
MAX_QUOTA_WAIT = timedelta(minutes=30)


class QuotaFull(Exception):
    """El contador propio o Google (429) dice que no hay cupo ahora."""


class ModelError(Exception):
    pass


# ─── Cuota ───

def _redis():
    from app.services.account_security import _redis as r
    return r()


async def try_acquire() -> bool:
    now = datetime.now(timezone.utc)
    rpm_key = f"gemini:rpm:{now:%Y%m%d%H%M}"
    rpd_key = f"gemini:rpd:{now.astimezone(PACIFIC):%Y%m%d}"
    r = _redis()
    try:
        minute = await r.incr(rpm_key)
        if minute == 1:
            await r.expire(rpm_key, 90)
        day = await r.incr(rpd_key)
        if day == 1:
            await r.expire(rpd_key, 2 * 86400)
    except Exception:  # noqa: BLE001 — sin Redis no se arriesga la cuota
        logger.warning("Redis no respondió para la cuota de Gemini")
        return False
    if minute > settings.gemini_rpm or day > settings.gemini_rpd:
        await r.decr(rpm_key)
        await r.decr(rpd_key)
        return False
    return True


# ─── Llamada al modelo (se reemplaza en las pruebas) ───

async def call_gemini(system: str, prompt: str, schema: dict) -> dict:
    url = f"{settings.gemini_base_url}/models/{settings.gemini_model}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema,
                             "temperature": 0.4, "maxOutputTokens": 4096,
                             "thinkingConfig": {"thinkingBudget": 0}},
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, json=body, headers={"x-goog-api-key": settings.gemini_api_key})
    except httpx.HTTPError as e:
        raise ModelError(f"sin respuesta: {type(e).__name__}") from None
    if r.status_code == 429:
        raise QuotaFull()
    if r.status_code != 200:
        raise ModelError(f"HTTP {r.status_code}")
    try:
        parts = r.json()["candidates"][0]["content"]["parts"]
        return json.loads("".join(p.get("text", "") for p in parts))
    except (KeyError, IndexError, ValueError) as e:
        raise ModelError(f"respuesta sin JSON válido: {type(e).__name__}") from None


# ─── Esquemas y prompts ───

def meal_schema(keys: list[str]) -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "notes": {"type": "STRING"},
            "meals": {"type": "ARRAY", "items": {
                "type": "OBJECT",
                "properties": {
                    "time": {"type": "STRING", "description": "HH:MM, 24 h"},
                    "name": {"type": "STRING"},
                    "items": {"type": "ARRAY", "items": {
                        "type": "OBJECT",
                        "properties": {"ref_key": {"type": "STRING", "enum": keys},
                                       "grams": {"type": "NUMBER"}},
                        "required": ["ref_key", "grams"]}},
                },
                "required": ["time", "name", "items"]}},
        },
        "required": ["notes", "meals"],
    }


TRAINING_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "notes": {"type": "STRING"},
        "days": {"type": "ARRAY", "items": {
            "type": "OBJECT",
            "properties": {
                "weekday": {"type": "INTEGER", "description": "0 = lunes … 6 = domingo"},
                "title": {"type": "STRING"},
                "exercises": {"type": "ARRAY", "items": {
                    "type": "OBJECT",
                    "properties": {"name": {"type": "STRING"}, "sets": {"type": "INTEGER"},
                                   "reps": {"type": "STRING"}, "rest_seconds": {"type": "INTEGER"},
                                   "notes": {"type": "STRING"}},
                    "required": ["name", "sets", "reps", "rest_seconds"]}},
            },
            "required": ["weekday", "title", "exercises"]}},
    },
    "required": ["notes", "days"],
}

SYSTEM = """Eres el motor de planes de FitConnect, una app de gimnasios en Colombia. No conversas: devuelves
SOLO el JSON del esquema. Escribe nombres y notas en español de Colombia, claros y breves.

Reglas:
- Te basas en la BASE DE CONOCIMIENTO. Orientación general: no diagnosticas ni tratas enfermedades.
- Comidas: usa SOLO alimentos de la lista (por su ref_key) con gramos realistas para una porción casera.
  Reparte la proteína en todas las comidas, incluye verduras o frutas y alimentos comunes en Colombia.
  El total del día debe acercarse a la meta de calorías y nunca bajar del mínimo indicado.
- Entreno: ejercicios comunes con nombre en español, series de 1 a 6, descansos de 30 a 240 s, días
  distintos (weekday 0 = lunes). Respeta los días por semana, el lugar y el tiempo por sesión.
- `notes`: dos o tres frases útiles para la persona, sin repetir el plan.
""" + plans.KNOWLEDGE

#: Alimentos que se le ofrecen al modelo para armar el día: comunes, con
#: datos completos y que se sirven tal cual (nada de harinas o crudos).
MEAL_CANDIDATES = sorted({k for meal in auto_plans.OPTIONS.values() for opts in meal.values() for k in opts if k != "ensalada"}
                         | set(auto_plans.VEG_MIX)
                         | {"tcac_309", "tcac_339", "tcac_252", "tcac_632", "tcac_638", "tcac_225", "tcac_228",
                            "plato_arepa_queso_rellena", "plato_huevos_pericos", "plato_calentado", "plato_sopa_lentejas",
                            "plato_avena_leche", "plato_batido_proteina_banano", "plato_tajadas_maduro", "plato_patacon",
                            "frijol_negro_cocido", "granola", "naranja", "uvas", "kiwi", "salmon_cocido",
                            "pechuga_pavo_asada", "clara_huevo", "bebida_soya", "proteina_whey"})


async def candidate_foods(adb: AsyncSession, restrictions: list[str]) -> dict[str, Food]:
    banned = set().union(*(auto_plans.RESTRICTED.get(r, set()) for r in restrictions)) if restrictions else set()
    if "vegetarian" in restrictions:
        banned |= {"salmon_cocido", "pechuga_pavo_asada"}
    if "no_dairy" in restrictions:
        banned |= {"tcac_632", "tcac_638", "plato_arepa_queso_rellena", "plato_avena_leche", "proteina_whey",
                   "plato_batido_proteina_banano"}
    if "no_fish" in restrictions:
        banned |= {"salmon_cocido"}
    keys = [k for k in MEAL_CANDIDATES if k not in banned]
    rows = (await adb.execute(select(Food).where(Food.ref_key.in_(keys), Food.owner_id.is_(None)))).scalars().all()
    return {f.ref_key: f for f in rows}


def meal_prompt(person: plans.Person, req: dict, foods: dict[str, Food]) -> str:
    lista = [{"ref_key": k, "nombre": f.name, "kcal_100g": float(f.kcal), "proteina_100g": float(f.protein_g),
              "carbohidratos_100g": float(f.carbs_g), "grasa_100g": float(f.fat_g),
              "porciones": [p["label"] + f" = {p['grams']} g" for p in (f.portions or []) if p["label"] != "100 g"][:2]}
             for k, f in foods.items()]
    return json.dumps({
        "tarea": f"Arma un día de comidas con {req['meals_per_day']} comidas.",
        "persona": person.anonymous(),
        "restricciones": [auto_plans.RESTRICTION_LABELS.get(r, r) for r in req.get("restrictions", [])],
        "alimentos_disponibles": lista,
    }, ensure_ascii=False)


def training_prompt(person: plans.Person, req: dict) -> str:
    return json.dumps({
        "tarea": f"Arma un plan semanal de entrenamiento de {req['days_per_week']} días.",
        "persona": {k: v for k, v in person.anonymous().items() if k not in ("metas", "minimo_kcal")},
        "nivel": req["level"], "lugar": "gimnasio" if req["place"] == "gym" else "casa, sin máquinas",
        "minutos_por_sesion": req["minutes"],
        "foco": {"strength": "fuerza", "hypertrophy": "hipertrofia", "general": "acondicionamiento general",
                 "fat_loss": "pérdida de grasa"}.get(req["focus"], "general"),
    }, ensure_ascii=False)


def _fit_to_target(meals: list[dict], foods_by_key: dict[str, Food], targets: dict) -> list[dict]:
    """Ajusta los gramos que propuso el modelo para cumplir calorías y macros
    del día (`portion_fit`). Cada cantidad se mueve entre 60 % y 150 % de la
    propuesta, y nunca pasa la porción razonable del alimento (180 g de
    almendras se vuelven 40 g): el modelo elige qué comer y el servidor afina cuánto."""
    slots, refs = [], []
    for m in meals:
        slot = portion_fit.Slot(share=None)
        for i in m.get("items") or []:
            g = i.get("grams") if isinstance(i, dict) else None
            if isinstance(g, (int, float)) and g > 0 and i.get("ref_key") in foods_by_key:
                hi = min(1500.0, 1.5 * g)
                if i["ref_key"] in auto_plans.FOOD_BOUNDS:
                    hi = min(hi, auto_plans.FOOD_BOUNDS[i["ref_key"]][1])
                slot.items.append(portion_fit.Item(food=foods_by_key[i["ref_key"]], lo=min(max(5.0, 0.6 * g), hi),
                                                   hi=hi, typical=min(float(g), hi)))
                refs.append(i)
        slots.append(slot)
    if not refs:
        return meals
    flat = [g for gs in portion_fit.fit(slots, targets) for g in gs]
    for i, g in zip(refs, flat):
        i["grams"] = g
    return meals


async def ai_meal_plan(adb: AsyncSession, person: plans.Person, req: dict) -> dict:
    foods = await candidate_foods(adb, req.get("restrictions", []))
    raw = await call_gemini(SYSTEM, meal_prompt(person, req, foods), meal_schema(list(foods)))
    meals = [m for m in (raw.get("meals") or []) if isinstance(m, dict)]
    meals = _fit_to_target(meals, foods, person.targets)
    data = {"notes": raw.get("notes"),
            "meals": [{"time": m.get("time"), "name": m.get("name"), "items": [
                {"food_id": str(foods[i["ref_key"]].id) if i.get("ref_key") in foods else None, "grams": i.get("grams")}
                for i in (m.get("items") or []) if isinstance(i, dict)]} for m in meals],
            "targets": {k: person.targets[k] for k in ("kcal", "protein_g", "carbs_g", "fat_g")}}
    return plans.validate_meals(data, person.min_kcal, {str(f.id): f for f in foods.values()})


async def ai_training_plan(person: plans.Person, req: dict) -> dict:
    raw = await call_gemini(SYSTEM, training_prompt(person, req), TRAINING_SCHEMA)
    data = plans.validate_training(raw)
    if len(data["days"]) != req["days_per_week"]:
        raise plans.PlanError("El plan no tiene los días pedidos")
    return data


# ─── Planes automáticos y guardado ───

async def auto_plan(adb: AsyncSession, user_id, person: plans.Person, kind: str, req: dict) -> dict:
    if kind == "meals":
        draft = await auto_plans.meal_plan(adb, user_id, person.targets, req["meals_per_day"],
                                           req.get("restrictions", []), today_bogota())
        allowed = await plans.foods_by_ids(adb, user_id, [i["food_id"] for m in draft["meals"] for i in m["items"]])
        return plans.validate_meals(draft, person.min_kcal, allowed)
    return plans.validate_training(auto_plans.training_plan(req["days_per_week"], req["level"], req["place"],
                                                            req["minutes"], req["focus"], person.parq_flag))


def title_for(kind: str, req: dict, engine: str) -> str:
    if kind == "meals":
        return f"Día de {req['meals_per_day']} comidas" + (" (IA)" if engine == "ai" else "")
    return f"Entreno de {req['days_per_week']} días" + (" (IA)" if engine == "ai" else "")


async def save_plan(adb: AsyncSession, user_id, kind: str, req: dict, engine: str, data: dict) -> SavedPlan:
    data = {**data, "engine": engine}
    p = SavedPlan(app_user_id=user_id, kind=kind, title=title_for(kind, req, engine), data=data)
    adb.add(p)
    await adb.flush()
    return p


# ─── Fila ───

async def queue_position(adb: AsyncSession, job: PlanJob) -> int:
    return int((await adb.execute(select(func.count()).select_from(PlanJob).where(
        PlanJob.status == "queued", PlanJob.created_at < job.created_at))).scalar() or 0) + 1


async def _finish_auto(adb: AsyncSession, job: PlanJob, person: plans.Person, reason: str) -> None:
    data = await auto_plan(adb, job.app_user_id, person, job.kind, job.request)
    p = await save_plan(adb, job.app_user_id, job.kind, job.request, "auto", data)
    job.status, job.engine, job.plan_id, job.finished_at = "done", "auto", p.id, utcnow_naive()
    job.error = reason[:300]
    await credits.refund(adb, job.app_user_id, str(job.id))


async def process_job(adb: AsyncSession, job: PlanJob, person: plans.Person) -> str:
    """Intenta un pedido. Devuelve el estado en que queda."""
    if not settings.gemini_api_key:
        await _finish_auto(adb, job, person, "La IA no está configurada en este servidor")
        return job.status
    if utcnow_naive() - job.created_at > MAX_QUOTA_WAIT:
        await _finish_auto(adb, job, person, "La IA estuvo ocupada demasiado tiempo")
        return job.status
    if not await try_acquire():
        return "queued"
    job.status, job.attempts = "running", job.attempts + 1
    await adb.commit()
    try:
        if job.kind == "meals":
            data = await ai_meal_plan(adb, person, job.request)
        else:
            data = await ai_training_plan(person, job.request)
    except QuotaFull:
        job.status = "queued"
        return job.status
    except (ModelError, plans.PlanError, KeyError, TypeError, ValueError) as e:
        logger.warning("Plan con IA falló (intento %s): %s", job.attempts, e)
        if job.attempts >= MAX_AI_ATTEMPTS:
            await _finish_auto(adb, job, person, "La IA no devolvió un plan válido")
        else:
            job.status = "queued"
        return job.status
    p = await save_plan(adb, job.app_user_id, job.kind, job.request, "ai", data)
    job.status, job.engine, job.plan_id, job.finished_at = "done", "ai", p.id, utcnow_naive()
    return job.status


async def process_queue(limit: int = 10, job_ids: Optional[list] = None) -> int:
    """Procesa pedidos en fila (el worker y el disparo tras encolar).
    `job_ids` limita a esos pedidos (pruebas)."""
    from app.db.app_db import app_session
    from app.db.master_session import MasterSessionLocal
    from app.models.master.app_user import AppUser

    done = 0
    async with app_session() as adb:
        stmt = select(PlanJob).where(PlanJob.status.in_(("queued", "running")))
        if job_ids is not None:
            stmt = stmt.where(PlanJob.id.in_(job_ids))
        jobs = (await adb.execute(stmt.order_by(PlanJob.created_at).limit(limit))).scalars().all()
        for job in jobs:
            if job.status == "running" and utcnow_naive() - job.created_at < timedelta(minutes=5):
                continue  # otro proceso lo tiene; si quedó colgado más de 5 min, se retoma
            async with MasterSessionLocal() as master:
                user = await master.get(AppUser, job.app_user_id)
                if user is None:
                    job.status, job.error = "failed", "La cuenta ya no existe"
                    await adb.commit()
                    continue
                person = await plans.person(user, master, adb)
            status = await process_job(adb, job, person)
            await adb.commit()
            if status == "queued":
                break  # sin cupo: el resto espera su turno
            done += 1
    return done


_lock: Optional[asyncio.Lock] = None


async def kick() -> None:
    """Procesa la fila en segundo plano sin bloquear la respuesta."""
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    if _lock.locked():
        return
    async with _lock:
        try:
            await process_queue()
        except Exception:  # noqa: BLE001 — el worker lo reintenta
            logger.exception("La fila de planes falló")


def job_out(job: PlanJob, position: Optional[int] = None, plan: Optional[SavedPlan] = None) -> dict[str, Any]:
    return {"id": str(job.id), "kind": job.kind, "status": job.status, "engine": job.engine,
            "position": position, "message": job.error,
            "plan": plans.plan_out(plan) if plan else None}
