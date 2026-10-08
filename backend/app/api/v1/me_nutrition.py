"""Nutrición en la app: metas, alimentos y registro de comidas (base fitconnect_app)."""
import uuid
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_user
from app.core.rate_limit import limiter
from app.core.timeutil import today_bogota
from app.db.app_db import app_session
from app.db.master_session import get_master_db
from app.models.app import AppProfile, Food, MealEntry
from app.models.master.app_user import AppUser
from app.services import app_accounts, foods, nutrition

router = APIRouter(prefix="/me", tags=["app"], dependencies=[Depends(get_app_user)])

MEALS = {"breakfast": "Desayuno", "lunch": "Almuerzo", "dinner": "Cena", "snack": "Entre comidas"}
NOTICE = ("Estimación de partida, no una prescripción. Si tienes una condición de salud, estás en embarazo "
          "o lactancia, o tomas medicamentos, consulta con un profesional de la salud.")


async def targets_for(user: AppUser, master: AsyncSession) -> dict:
    """Metas del día o por qué no se pueden calcular todavía."""
    if not (await app_accounts.consents(master, user.id))["health"]:
        return {"available": False, "reason": "consent",
                "message": "Para calcular tus metas autoriza el uso de tus datos de salud (peso y talla)."}
    async with app_session() as adb:
        p = await adb.get(AppProfile, user.id)
    try:
        t = nutrition.compute(
            sex=p.sex if p else None, weight_kg=float(p.weight_kg) if p and p.weight_kg else None,
            height_cm=p.height_cm if p else None, birth_date=p.birth_date if p else None,
            activity=p.activity_level if p else None, goal=p.goal if p else None, today=today_bogota(),
        )
    except nutrition.MissingData as e:
        return {"available": False, "reason": "missing", "missing": e.missing,
                "message": f"Completa en Mis medidas: {', '.join(e.missing)}."}
    except ValueError as e:
        return {"available": False, "reason": "age", "message": str(e)}
    return {"available": True, "targets": t.as_dict(), "notice": NOTICE, "references": nutrition.REFERENCES,
            "clamped_message": ("Tu meta quedó en el mínimo seguro: no bajamos de tu gasto en reposo. Para un "
                                "déficit mayor, hazlo con un profesional.") if t.clamped else None}


@router.get("/nutrition/targets")
async def nutrition_targets(user: AppUser = Depends(get_app_user), master: AsyncSession = Depends(get_master_db)):
    return {**(await targets_for(user, master)), "activity_labels": nutrition.ACTIVITY_LABEL}


@router.get("/foods")
async def search_foods(q: str = Query("", max_length=80), user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        return [foods.out(f) for f in await foods.search(adb, user.id, q)]


@router.get("/foods/barcode/{code}")
@limiter.limit("30/minute")
async def food_by_barcode(request: Request, code: str, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        food = await foods.by_barcode(adb, code.strip())
    if food is None:
        raise HTTPException(status_code=404, detail="No encontramos ese producto. Puedes agregarlo a mano con los datos de la etiqueta.")
    return foods.out(food)


class FoodIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    kcal: float = Field(ge=0, le=900)
    protein_g: float = Field(default=0, ge=0, le=100)
    carbs_g: float = Field(default=0, ge=0, le=100)
    fat_g: float = Field(default=0, ge=0, le=100)
    fiber_g: float = Field(default=0, ge=0, le=100)
    barcode: Optional[str] = Field(default=None, pattern=r"^\d{8,14}$")


@router.post("/foods", status_code=201)
async def create_food(payload: FoodIn, user: AppUser = Depends(get_app_user)):
    """Alimento propio (por 100 g, como en la etiqueta). Solo lo ve quien lo crea.
    No guarda el código de barras: ese código es global y un alimento privado no
    puede aparecerle a otra persona que escanee el mismo producto."""
    if payload.protein_g + payload.carbs_g + payload.fat_g > 100:
        raise HTTPException(status_code=422, detail="Proteína, carbohidratos y grasa no pueden sumar más de 100 g por cada 100 g.")
    async with app_session() as adb:
        food = Food(source="custom", owner_id=user.id, **payload.model_dump(exclude={"barcode"}))
        adb.add(food)
        await adb.commit()
        return foods.out(food)


class MealIn(BaseModel):
    id: uuid.UUID
    day: Optional[date] = None
    meal: Literal["breakfast", "lunch", "dinner", "snack"]
    food_id: uuid.UUID
    grams: float = Field(gt=0, le=3000)


def _meal_out(m: MealEntry) -> dict:
    return {"id": str(m.id), "day": m.day.isoformat(), "meal": m.meal, "food_id": str(m.food_id) if m.food_id else None,
            "food_name": m.food_name, "grams": float(m.grams), "kcal": float(m.kcal),
            "protein_g": float(m.protein_g), "carbs_g": float(m.carbs_g), "fat_g": float(m.fat_g)}


@router.post("/meals")
async def log_meal(payload: MealIn, user: AppUser = Depends(get_app_user)):
    """Idempotente por id: el celular reenvía lo que registró sin señal."""
    today = today_bogota()
    day = payload.day or today
    if not (today - timedelta(days=60) <= day <= today + timedelta(days=1)):
        raise HTTPException(status_code=422, detail="Esa fecha está fuera de rango")
    async with app_session() as adb:
        existing = await adb.get(MealEntry, payload.id)
        if existing is not None:
            if existing.app_user_id != user.id:
                raise HTTPException(status_code=409, detail="Ese registro ya existe")
            return {"status": "duplicate", "entry": _meal_out(existing)}
        food = (await adb.execute(select(Food).where(
            Food.id == payload.food_id, or_(Food.owner_id.is_(None), Food.owner_id == user.id)
        ))).scalar_one_or_none()
        if food is None:
            raise HTTPException(status_code=404, detail="Alimento no encontrado")
        m = nutrition.macros_for(payload.grams, foods.out(food))
        entry = MealEntry(id=payload.id, app_user_id=user.id, day=day, meal=payload.meal, food_id=food.id,
                          food_name=food.name, grams=payload.grams, kcal=m["kcal"], protein_g=m["protein_g"],
                          carbs_g=m["carbs_g"], fat_g=m["fat_g"])
        adb.add(entry)
        await adb.commit()
        return {"status": "created", "entry": _meal_out(entry)}


@router.get("/meals")
async def day_meals(day: Optional[date] = None, user: AppUser = Depends(get_app_user)):
    day = day or today_bogota()
    async with app_session() as adb:
        rows = (await adb.execute(select(MealEntry).where(MealEntry.app_user_id == user.id, MealEntry.day == day)
                                  .order_by(MealEntry.created_at))).scalars().all()
    entries = [_meal_out(m) for m in rows]
    totals = {k: round(sum(e[k] for e in entries), 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g")}
    return {"day": day.isoformat(), "meals": MEALS, "entries": entries, "totals": totals}


@router.delete("/meals/{entry_id}")
async def delete_meal(entry_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        m = await adb.get(MealEntry, entry_id)
        if m is None or m.app_user_id != user.id:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        await adb.delete(m)
        await adb.commit()
    return {"ok": True}
