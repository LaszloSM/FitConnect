"""Nutrición en la app: metas, alimentos, recetas, registro de comidas y peso
(base fitconnect_app)."""
import uuid
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_user
from app.core.rate_limit import limiter
from app.core.timeutil import today_bogota
from app.db.app_db import app_session
from app.db.master_session import get_master_db
from app.models.app import AppProfile, Food, FoodFavorite, MealEntry, WaterEntry, WeightLog
from app.models.master.app_user import AppUser
from app.services import app_accounts, foods, nutrition

router = APIRouter(prefix="/me", tags=["app"], dependencies=[Depends(get_app_user)])

MEALS = {"breakfast": "Desayuno", "lunch": "Almuerzo", "dinner": "Cena", "snack": "Entre comidas"}
NOTICE = ("Estimación de partida, no una prescripción. Si tienes una condición de salud, estás en embarazo "
          "o lactancia, o tomas medicamentos, consulta con un profesional de la salud.")
NUTRIENT_LABELS = {
    "sugars_g": ("Azúcares", "g"), "sat_fat_g": ("Grasa saturada", "g"), "sodium_mg": ("Sodio", "mg"),
    "potassium_mg": ("Potasio", "mg"), "calcium_mg": ("Calcio", "mg"), "iron_mg": ("Hierro", "mg"),
    "vit_c_mg": ("Vitamina C", "mg"), "vit_a_ug": ("Vitamina A", "µg"), "vit_d_ug": ("Vitamina D", "µg"),
    "vit_b12_ug": ("Vitamina B12", "µg"), "cholesterol_mg": ("Colesterol", "mg"),
}


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
            pace=p.pace if p else None,
        )
    except nutrition.MissingData as e:
        return {"available": False, "reason": "missing", "missing": e.missing,
                "message": f"Completa en Mis medidas: {', '.join(e.missing)}."}
    except ValueError as e:
        return {"available": False, "reason": "age", "message": str(e)}
    pace_note = None
    if t.too_fast:
        pace_note = ("Con este ritmo bajarías más del 1 % de tu peso por semana. Un ritmo más suave conserva "
                     "mejor el músculo y es más fácil de sostener.")
    return {"available": True, "targets": t.as_dict(), "notice": NOTICE, "references": nutrition.REFERENCES,
            "pace_note": pace_note,
            "clamped_message": ("Tu meta quedó en el mínimo seguro: no bajamos de tu gasto en reposo. Para un "
                                "déficit mayor, hazlo con un profesional.") if t.clamped else None}


@router.get("/nutrition/targets")
async def nutrition_targets(user: AppUser = Depends(get_app_user), master: AsyncSession = Depends(get_master_db)):
    return {**(await targets_for(user, master)), "activity_labels": nutrition.ACTIVITY_LABEL,
            "pace_options": {"lose_fat": ["gentle", "moderate", "aggressive"], "gain_muscle": ["lean", "standard"]},
            "pace_labels": nutrition.PACE_LABEL, "nutrient_labels": NUTRIENT_LABELS}


# ─── Alimentos ───

async def _favorite_ids(adb: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    return set((await adb.execute(select(FoodFavorite.food_id).where(FoodFavorite.app_user_id == user_id))).scalars())


def _with_fav(f: Food, favs: set[uuid.UUID]) -> dict:
    return {**foods.out(f), "favorite": f.id in favs}


@router.get("/foods")
async def search_foods(q: str = Query("", max_length=80), category: Optional[str] = Query(None, max_length=40),
                       user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        favs = await _favorite_ids(adb, user.id)
        return [_with_fav(f, favs) for f in await foods.search(adb, user.id, q, category=category)]


@router.get("/foods/categories")
async def food_categories():
    return [{"key": k, "label": v} for k, v in foods.CATEGORIES.items()]


@router.get("/foods/recent")
async def recent_foods(user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        favs = await _favorite_ids(adb, user.id)
        recent = await foods.recent(adb, user.id)
        fav_rows = (await adb.execute(select(Food).where(Food.id.in_(favs), foods.visible(user.id))
                                      .order_by(Food.name))).scalars().all() if favs else []
    return {"recent": [_with_fav(f, favs) for f in recent], "favorites": [_with_fav(f, favs) for f in fav_rows]}


@router.get("/foods/barcode/{code}")
@limiter.limit("30/minute")
async def food_by_barcode(request: Request, code: str, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        food = await foods.by_barcode(adb, code.strip())
    if food is None:
        raise HTTPException(status_code=404, detail="No encontramos ese producto. Puedes agregarlo a mano con los datos de la etiqueta.")
    return foods.out(food)


async def _visible_food(adb: AsyncSession, food_id: uuid.UUID, user: AppUser) -> Food:
    food = (await adb.execute(select(Food).where(Food.id == food_id, foods.visible(user.id)))).scalar_one_or_none()
    if food is None:
        raise HTTPException(status_code=404, detail="Alimento no encontrado")
    return food


async def _own_food(adb: AsyncSession, food_id: uuid.UUID, user: AppUser) -> Food:
    food = await adb.get(Food, food_id)
    if food is None or food.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Alimento no encontrado")
    return food


@router.get("/foods/{food_id}")
async def get_food(food_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        food = await _visible_food(adb, food_id, user)
        return _with_fav(food, await _favorite_ids(adb, user.id))


class NutrientsIn(BaseModel):
    sugars_g: Optional[float] = Field(default=None, ge=0, le=100)
    sat_fat_g: Optional[float] = Field(default=None, ge=0, le=100)
    sodium_mg: Optional[float] = Field(default=None, ge=0, le=40000)
    potassium_mg: Optional[float] = Field(default=None, ge=0, le=10000)
    calcium_mg: Optional[float] = Field(default=None, ge=0, le=5000)
    iron_mg: Optional[float] = Field(default=None, ge=0, le=200)
    vit_c_mg: Optional[float] = Field(default=None, ge=0, le=5000)
    vit_a_ug: Optional[float] = Field(default=None, ge=0, le=30000)
    vit_d_ug: Optional[float] = Field(default=None, ge=0, le=500)
    vit_b12_ug: Optional[float] = Field(default=None, ge=0, le=1000)
    cholesterol_mg: Optional[float] = Field(default=None, ge=0, le=3000)


class PortionIn(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    grams: float = Field(gt=0, le=3000)


class FoodIn(BaseModel):
    """Un alimento propio con los datos de la etiqueta.

    `basis`: «100g» si los valores son por 100 g (o ml), «serving» si son por
    porción de `serving_grams`. Se guarda siempre por 100 g."""
    name: str = Field(min_length=2, max_length=200)
    brand: Optional[str] = Field(default=None, max_length=120)
    category: Optional[str] = Field(default=None, max_length=40)
    basis: Literal["100g", "serving"] = "100g"
    serving_grams: Optional[float] = Field(default=None, gt=0, le=3000)
    serving_label: Optional[str] = Field(default=None, max_length=60)
    kcal: float = Field(ge=0, le=3000)
    protein_g: float = Field(default=0, ge=0, le=300)
    carbs_g: float = Field(default=0, ge=0, le=300)
    fat_g: float = Field(default=0, ge=0, le=300)
    fiber_g: float = Field(default=0, ge=0, le=300)
    nutrients: NutrientsIn = Field(default_factory=NutrientsIn)
    portions: list[PortionIn] = Field(default_factory=list, max_length=6)
    barcode: Optional[str] = Field(default=None, pattern=r"^\d{8,14}$")

    @model_validator(mode="after")
    def _serving(self):
        if self.basis == "serving" and not self.serving_grams:
            raise ValueError("Indica cuántos gramos tiene la porción de la etiqueta")
        return self

    def per100(self) -> dict:
        f = 100 / self.serving_grams if self.basis == "serving" else 1.0
        macros = {k: round(getattr(self, k) * f, 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}
        micro = {k: round(v * f, 2) for k, v in self.nutrients.model_dump().items() if v is not None}
        if macros["protein_g"] + macros["carbs_g"] + macros["fat_g"] > 100.5:
            raise HTTPException(status_code=422, detail="Proteína, carbohidratos y grasa no pueden sumar más de 100 g por cada 100 g. Revisa los gramos de la porción.")
        if macros["kcal"] > 905:
            raise HTTPException(status_code=422, detail="Ningún alimento tiene más de 900 kcal por 100 g. Revisa la porción o las calorías.")
        return {**macros, "nutrients": micro}

    def portion_list(self) -> list[dict]:
        rows = [p.model_dump() for p in self.portions]
        if self.basis == "serving":
            rows.insert(0, {"label": (self.serving_label or "1 porción").strip(), "grams": self.serving_grams})
        return rows + [{"label": "100 g", "grams": 100}]


def _atwater_warning(v: dict) -> Optional[str]:
    est = 4 * v["protein_g"] + 4 * v["carbs_g"] + 9 * v["fat_g"]
    if v["kcal"] > 20 and abs(est - v["kcal"]) > max(20, 0.2 * v["kcal"]):
        return (f"Las calorías ({round(v['kcal'])}) no cuadran con los macros (≈{round(est)} kcal). "
                "Revisa la etiqueta; lo guardamos igual.")
    return None


@router.post("/foods", status_code=201)
async def create_food(payload: FoodIn, user: AppUser = Depends(get_app_user)):
    """Alimento propio. Solo lo ve quien lo crea. No guarda el código de
    barras: ese código es global y un alimento privado no puede aparecerle a
    otra persona que escanee el mismo producto."""
    v = payload.per100()
    if payload.category and payload.category not in foods.CATEGORIES:
        raise HTTPException(status_code=422, detail="Categoría desconocida")
    async with app_session() as adb:
        food = Food(source="custom", owner_id=user.id, name=payload.name.strip(), brand=payload.brand,
                    category=payload.category or "otros", portions=payload.portion_list(), origin="Etiqueta",
                    search_text=foods.search_text_for(payload.name, (), payload.brand), **v)
        adb.add(food)
        await adb.commit()
        return {**foods.out(food), "favorite": False, "warning": _atwater_warning(v)}


@router.put("/foods/{food_id}")
async def update_food(food_id: uuid.UUID, payload: FoodIn, user: AppUser = Depends(get_app_user)):
    """Edita un alimento propio. Lo que ya se registró con él no cambia: cada
    registro guarda su propio aporte."""
    v = payload.per100()
    async with app_session() as adb:
        food = await _own_food(adb, food_id, user)
        if food.source != "custom":
            raise HTTPException(status_code=409, detail="Las recetas se editan desde Mis comidas")
        food.name, food.brand = payload.name.strip(), payload.brand
        food.category = payload.category or food.category
        food.portions = payload.portion_list()
        food.search_text = foods.search_text_for(food.name, (), food.brand)
        for k, val in v.items():
            setattr(food, k, val)
        await adb.commit()
        return {**foods.out(food), "warning": _atwater_warning(v)}


@router.delete("/foods/{food_id}")
async def delete_food(food_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        food = await _own_food(adb, food_id, user)
        await adb.execute(delete(FoodFavorite).where(FoodFavorite.food_id == food.id))
        await adb.delete(food)
        await adb.commit()
    return {"ok": True}


@router.post("/foods/{food_id}/favorite")
async def favorite_food(food_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        await _visible_food(adb, food_id, user)
        adb.add(FoodFavorite(app_user_id=user.id, food_id=food_id))
        try:
            await adb.commit()
        except IntegrityError:
            await adb.rollback()
    return {"favorite": True}


@router.delete("/foods/{food_id}/favorite")
async def unfavorite_food(food_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        await adb.execute(delete(FoodFavorite).where(FoodFavorite.app_user_id == user.id, FoodFavorite.food_id == food_id))
        await adb.commit()
    return {"favorite": False}


class RecipeItemIn(BaseModel):
    food_id: uuid.UUID
    grams: float = Field(gt=0, le=3000)


class RecipeIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    items: list[RecipeItemIn] = Field(min_length=1, max_length=30)
    servings: int = Field(default=1, ge=1, le=20)


async def _recipe_fields(adb: AsyncSession, payload: RecipeIn, user: AppUser, self_id: Optional[uuid.UUID] = None) -> dict:
    parts = []
    components = []
    for it in payload.items:
        if self_id and it.food_id == self_id:
            raise HTTPException(status_code=422, detail="Una receta no puede contenerse a sí misma")
        f = await _visible_food(adb, it.food_id, user)
        parts.append((f, it.grams))
        components.append({"food_id": str(f.id), "name": f.name, "grams": it.grams})
    v = foods.recipe_per100(parts)
    total = v.pop("total_grams")
    serving = round(total / payload.servings, 1)
    return {"name": payload.name.strip(), "components": components, "category": "platos",
            "portions": [{"label": "1 porción" if payload.servings > 1 else "Toda la receta", "grams": serving},
                         *([{"label": "Toda la receta", "grams": total}] if payload.servings > 1 else []),
                         {"label": "100 g", "grams": 100}],
            "search_text": foods.search_text_for(payload.name), "origin": "Mi receta", **v}


@router.post("/recipes", status_code=201)
async def create_recipe(payload: RecipeIn, user: AppUser = Depends(get_app_user)):
    """«Mi comida»: varios alimentos guardados como uno, por 100 g."""
    async with app_session() as adb:
        food = Food(source="recipe", owner_id=user.id, **(await _recipe_fields(adb, payload, user)))
        adb.add(food)
        await adb.commit()
        return {**foods.out(food), "favorite": False}


@router.put("/recipes/{food_id}")
async def update_recipe(food_id: uuid.UUID, payload: RecipeIn, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        food = await _own_food(adb, food_id, user)
        if food.source != "recipe":
            raise HTTPException(status_code=409, detail="Eso no es una receta")
        for k, v in (await _recipe_fields(adb, payload, user, self_id=food.id)).items():
            setattr(food, k, v)
        await adb.commit()
        return foods.out(food)


# ─── Registro de comidas ───

QUICK_LABEL = "Registro rápido"


class MealIn(BaseModel):
    """Un alimento con sus gramos, o un registro rápido: solo calorías (y
    macros si la persona los sabe), sin buscar nada."""
    id: uuid.UUID
    day: Optional[date] = None
    meal: Literal["breakfast", "lunch", "dinner", "snack"]
    food_id: Optional[uuid.UUID] = None
    grams: Optional[float] = Field(default=None, gt=0, le=3000)
    label: Optional[str] = Field(default=None, max_length=80)
    kcal: Optional[float] = Field(default=None, gt=0, le=5000)
    protein_g: Optional[float] = Field(default=None, ge=0, le=500)
    carbs_g: Optional[float] = Field(default=None, ge=0, le=800)
    fat_g: Optional[float] = Field(default=None, ge=0, le=400)

    @model_validator(mode="after")
    def _food_or_quick(self) -> "MealIn":
        if self.food_id is not None:
            if self.grams is None:
                raise ValueError("Indica los gramos")
            if self.kcal is not None:
                raise ValueError("Un alimento no lleva calorías a mano: salen de su ficha")
        elif self.kcal is None:
            raise ValueError("Elige un alimento o escribe las calorías")
        return self

    @property
    def quick(self) -> bool:
        return self.food_id is None


def _meal_out(m: MealEntry) -> dict:
    return {"id": str(m.id), "day": m.day.isoformat(), "meal": m.meal, "food_id": str(m.food_id) if m.food_id else None,
            "food_name": m.food_name, "grams": float(m.grams), "kcal": float(m.kcal),
            "protein_g": float(m.protein_g), "carbs_g": float(m.carbs_g), "fat_g": float(m.fat_g),
            "fiber_g": float(m.fiber_g or 0), "nutrients": m.nutrients or {}}


def _check_day(day: date) -> None:
    today = today_bogota()
    if not (today - timedelta(days=60) <= day <= today + timedelta(days=1)):
        raise HTTPException(status_code=422, detail="Esa fecha está fuera de rango")


def _entry(user: AppUser, entry_id: uuid.UUID, day: date, meal: str, food: Food, grams: float) -> MealEntry:
    v = foods.scaled(grams, food)
    return MealEntry(id=entry_id, app_user_id=user.id, day=day, meal=meal, food_id=food.id, food_name=food.name,
                     grams=grams, kcal=v["kcal"], protein_g=v["protein_g"], carbs_g=v["carbs_g"], fat_g=v["fat_g"],
                     fiber_g=v["fiber_g"], nutrients=v["nutrients"])


@router.post("/meals")
async def log_meal(payload: MealIn, user: AppUser = Depends(get_app_user)):
    """Idempotente por id: el celular reenvía lo que registró sin señal."""
    day = payload.day or today_bogota()
    _check_day(day)
    async with app_session() as adb:
        existing = await adb.get(MealEntry, payload.id)
        if existing is not None:
            if existing.app_user_id != user.id:
                raise HTTPException(status_code=409, detail="Ese registro ya existe")
            return {"status": "duplicate", "entry": _meal_out(existing)}
        if payload.quick:
            entry = MealEntry(id=payload.id, app_user_id=user.id, day=day, meal=payload.meal, food_id=None,
                              food_name=(payload.label or "").strip() or QUICK_LABEL, grams=0,
                              kcal=round(payload.kcal, 1), protein_g=round(payload.protein_g or 0, 1),
                              carbs_g=round(payload.carbs_g or 0, 1), fat_g=round(payload.fat_g or 0, 1),
                              fiber_g=0, nutrients={})
        else:
            food = await _visible_food(adb, payload.food_id, user)
            entry = _entry(user, payload.id, day, payload.meal, food, payload.grams)
        adb.add(entry)
        await adb.commit()
        return {"status": "created", "entry": _meal_out(entry)}


class MealPatch(BaseModel):
    grams: Optional[float] = Field(default=None, gt=0, le=3000)
    meal: Optional[Literal["breakfast", "lunch", "dinner", "snack"]] = None


@router.patch("/meals/{entry_id}")
async def edit_meal(entry_id: uuid.UUID, payload: MealPatch, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        m = await adb.get(MealEntry, entry_id)
        if m is None or m.app_user_id != user.id:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        if payload.meal:
            m.meal = payload.meal
        if payload.grams and not float(m.grams):
            raise HTTPException(status_code=422, detail="Un registro rápido no tiene gramos que cambiar")
        if payload.grams and payload.grams != float(m.grams):
            # Se recalcula en proporción al registro: el alimento pudo cambiar o borrarse.
            f = payload.grams / float(m.grams)
            m.kcal, m.protein_g = round(float(m.kcal) * f, 1), round(float(m.protein_g) * f, 1)
            m.carbs_g, m.fat_g = round(float(m.carbs_g) * f, 1), round(float(m.fat_g) * f, 1)
            m.fiber_g = round(float(m.fiber_g or 0) * f, 1)
            m.nutrients = {k: round(float(v) * f, 2) for k, v in (m.nutrients or {}).items()}
            m.grams = payload.grams
        await adb.commit()
        return _meal_out(m)


class CopyIn(BaseModel):
    from_day: date
    to_day: Optional[date] = None
    meal: Optional[Literal["breakfast", "lunch", "dinner", "snack"]] = None
    to_meal: Optional[Literal["breakfast", "lunch", "dinner", "snack"]] = None
    #: Ids nuevos que manda el celular, uno por registro copiado, para que
    #: reintentar la copia no duplique nada.
    ids: list[uuid.UUID] = Field(min_length=1, max_length=60)


@router.post("/meals/copy")
async def copy_meals(payload: CopyIn, user: AppUser = Depends(get_app_user)):
    """«Repetir lo de ayer»: copia los registros de un día (o de una comida)."""
    to_day = payload.to_day or today_bogota()
    _check_day(to_day)
    async with app_session() as adb:
        stmt = select(MealEntry).where(MealEntry.app_user_id == user.id, MealEntry.day == payload.from_day)
        if payload.meal:
            stmt = stmt.where(MealEntry.meal == payload.meal)
        rows = (await adb.execute(stmt.order_by(MealEntry.created_at))).scalars().all()
        if not rows:
            raise HTTPException(status_code=404, detail="Ese día no tiene comidas registradas")
        if len(payload.ids) < len(rows):
            raise HTTPException(status_code=422, detail=f"Faltan ids: hay {len(rows)} registros para copiar")
        created = []
        for new_id, src in zip(payload.ids, rows):
            existing = await adb.get(MealEntry, new_id)
            if existing is not None:
                if existing.app_user_id != user.id:
                    raise HTTPException(status_code=409, detail="Ese registro ya existe")
                created.append(existing)
                continue
            m = MealEntry(id=new_id, app_user_id=user.id, day=to_day, meal=payload.to_meal or src.meal,
                          food_id=src.food_id, food_name=src.food_name, grams=src.grams, kcal=src.kcal,
                          protein_g=src.protein_g, carbs_g=src.carbs_g, fat_g=src.fat_g, fiber_g=src.fiber_g,
                          nutrients=src.nutrients)
            adb.add(m)
            created.append(m)
        await adb.commit()
        return {"entries": [_meal_out(m) for m in created]}


def _totals(entries: list[dict]) -> dict:
    totals = {k: round(sum(e[k] for e in entries), 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}
    micro = {}
    for k in NUTRIENT_LABELS:
        have = [e["nutrients"].get(k) for e in entries]
        known = [v for v in have if v is not None]
        if known:
            # `complete` en falso: algún alimento del día no trae ese dato, así
            # que la cifra real es mayor que la que se muestra.
            micro[k] = {"value": round(sum(known), 1), "complete": len(known) == len(have)}
    return {**totals, "nutrients": micro}


@router.get("/meals")
async def day_meals(day: Optional[date] = None, user: AppUser = Depends(get_app_user)):
    day = day or today_bogota()
    async with app_session() as adb:
        rows = (await adb.execute(select(MealEntry).where(MealEntry.app_user_id == user.id, MealEntry.day == day)
                                  .order_by(MealEntry.created_at))).scalars().all()
    entries = [_meal_out(m) for m in rows]
    return {"day": day.isoformat(), "meals": MEALS, "entries": entries, "totals": _totals(entries)}


@router.get("/nutrition/week")
async def week_summary(end: Optional[date] = None, user: AppUser = Depends(get_app_user),
                       master: AsyncSession = Depends(get_master_db)):
    """Últimos 7 días (incluido `end`), con la meta del día para comparar."""
    end = end or today_bogota()
    start = end - timedelta(days=6)
    async with app_session() as adb:
        rows = (await adb.execute(select(MealEntry).where(
            MealEntry.app_user_id == user.id, MealEntry.day >= start, MealEntry.day <= end))).scalars().all()
    by_day: dict[date, list[dict]] = {start + timedelta(days=i): [] for i in range(7)}
    for m in rows:
        by_day[m.day].append(_meal_out(m))
    t = await targets_for(user, master)
    days = [{"day": d.isoformat(), "logged": bool(es), **{k: v for k, v in _totals(es).items() if k != "nutrients"}}
            for d, es in by_day.items()]
    logged = [d for d in days if d["logged"]]
    avg = {k: round(sum(d[k] for d in logged) / len(logged), 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g")} if logged else None
    return {"start": start.isoformat(), "end": end.isoformat(), "days": days, "average": avg,
            "target": t["targets"] if t.get("available") else None}


@router.delete("/meals/{entry_id}")
async def delete_meal(entry_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        m = await adb.get(MealEntry, entry_id)
        if m is None or m.app_user_id != user.id:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        await adb.delete(m)
        await adb.commit()
    return {"ok": True}


# ─── Peso ───

@router.get("/weight")
async def weight_history(days: int = Query(120, ge=7, le=730), user: AppUser = Depends(get_app_user),
                         master: AsyncSession = Depends(get_master_db)):
    if not (await app_accounts.consents(master, user.id))["health"]:
        return {"available": False, "points": []}
    since = today_bogota() - timedelta(days=days)
    async with app_session() as adb:
        rows = (await adb.execute(select(WeightLog).where(WeightLog.app_user_id == user.id, WeightLog.day >= since)
                                  .order_by(WeightLog.day))).scalars().all()
    points = [{"day": r.day.isoformat(), "weight_kg": float(r.weight_kg)} for r in rows]
    return {"available": True, "points": points}


# ─── Agua ───

GLASS_ML = 250


async def _water_goal(adb: AsyncSession, user: AppUser, master: AsyncSession) -> int:
    p = await adb.get(AppProfile, user.id)
    if p is not None and p.water_goal_ml:
        return p.water_goal_ml
    # 35 ml por kg, redondeado a vasos; el peso solo se usa con la autorización de salud.
    if p is not None and p.weight_kg and (await app_accounts.consents(master, user.id))["health"]:
        return max(1500, min(4000, round(float(p.weight_kg) * 35 / GLASS_ML) * GLASS_ML))
    return 2000


async def _water_day(adb: AsyncSession, user: AppUser, master: AsyncSession, day: date) -> dict:
    rows = (await adb.execute(select(WaterEntry).where(WaterEntry.app_user_id == user.id, WaterEntry.day == day)
                              .order_by(WaterEntry.created_at))).scalars().all()
    return {"day": day.isoformat(), "total_ml": sum(r.ml for r in rows), "goal_ml": await _water_goal(adb, user, master),
            "glass_ml": GLASS_ML, "entries": [{"id": str(r.id), "ml": r.ml} for r in rows]}


@router.get("/water")
async def water_today(day: Optional[date] = None, user: AppUser = Depends(get_app_user),
                      master: AsyncSession = Depends(get_master_db)):
    day = day or today_bogota()
    async with app_session() as adb:
        return await _water_day(adb, user, master, day)


class WaterIn(BaseModel):
    id: uuid.UUID
    day: Optional[date] = None
    ml: int = Field(default=GLASS_ML, gt=0, le=2000)


@router.post("/water")
async def add_water(payload: WaterIn, user: AppUser = Depends(get_app_user),
                    master: AsyncSession = Depends(get_master_db)):
    """Idempotente por id, como las comidas."""
    day = payload.day or today_bogota()
    _check_day(day)
    async with app_session() as adb:
        existing = await adb.get(WaterEntry, payload.id)
        if existing is not None and existing.app_user_id != user.id:
            raise HTTPException(status_code=409, detail="Ese registro ya existe")
        if existing is None:
            adb.add(WaterEntry(id=payload.id, app_user_id=user.id, day=day, ml=payload.ml))
            try:
                await adb.commit()
            except IntegrityError:
                # Dos reenvíos simultáneos del mismo vaso: ya quedó el primero.
                await adb.rollback()
        return await _water_day(adb, user, master, day)


@router.delete("/water/{entry_id}")
async def remove_water(entry_id: uuid.UUID, user: AppUser = Depends(get_app_user),
                       master: AsyncSession = Depends(get_master_db)):
    async with app_session() as adb:
        w = await adb.get(WaterEntry, entry_id)
        if w is None or w.app_user_id != user.id:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        day = w.day
        await adb.delete(w)
        await adb.commit()
        return await _water_day(adb, user, master, day)


class WaterGoalIn(BaseModel):
    #: Vacío vuelve al cálculo automático.
    goal_ml: Optional[int] = Field(default=None, ge=500, le=6000)


@router.put("/water/goal")
async def set_water_goal(payload: WaterGoalIn, user: AppUser = Depends(get_app_user),
                         master: AsyncSession = Depends(get_master_db)):
    async with app_session() as adb:
        p = await adb.get(AppProfile, user.id)
        if p is None:
            p = AppProfile(app_user_id=user.id)
            adb.add(p)
        p.water_goal_ml = payload.goal_ml
        await adb.commit()
        return await _water_day(adb, user, master, today_bogota())


# ─── Racha ───

def streaks(days: set[date], today: date) -> dict:
    """Racha de días seguidos con al menos una comida registrada.

    Hoy todavía sin registro no rompe la racha: cuenta hasta ayer y el día
    sigue abierto. Perder un día reinicia la actual, nunca la mejor."""
    anchor = today if today in days else today - timedelta(days=1)
    current = 0
    d = anchor
    while d in days:
        current += 1
        d -= timedelta(days=1)
    best = run = 0
    prev: Optional[date] = None
    for d in sorted(days):
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = d
    week = [{"day": (today - timedelta(days=i)).isoformat(), "logged": (today - timedelta(days=i)) in days}
            for i in range(6, -1, -1)]
    return {"current": current, "best": max(best, current), "today_logged": today in days, "week": week}


@router.get("/streak")
async def streak(user: AppUser = Depends(get_app_user)):
    today = today_bogota()
    async with app_session() as adb:
        rows = (await adb.execute(select(MealEntry.day).where(
            MealEntry.app_user_id == user.id, MealEntry.day >= today - timedelta(days=400),
            MealEntry.day <= today).distinct())).scalars().all()
    return streaks(set(rows), today)
