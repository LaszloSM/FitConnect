"""Alimentos: la base de referencia incluida (TCAC del ICBF, USDA y platos
colombianos), los productos empacados de Colombia y lo que traen los códigos de
barras (Open Food Facts), los alimentos propios de cada persona y sus recetas
(«mi comida»)."""
from __future__ import annotations

import gzip
import json
import logging
import re
import unicodedata
import uuid
from collections import Counter
from datetime import timedelta
from pathlib import Path
from typing import Iterable, Optional

import httpx
from sqlalchemy import case, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.app import Food, MealEntry

logger = logging.getLogger(__name__)
REFERENCE = Path(__file__).resolve().parent.parent / "data" / "foods_reference.json"
#: Productos empacados de Colombia (Open Food Facts), para que el escáner los
#: encuentre sin salir a internet. Lo arma `scripts/build_packaged.py`.
PACKAGED = Path(__file__).resolve().parent.parent / "data" / "foods_packaged.json.gz"
OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
OFF_FIELDS = "product_name,product_name_es,brands,nutriments,serving_quantity"
USER_AGENT = "LSMFit/0.1 (app de entrenamiento; contacto lsmfit.business@gmail.com)"

MACROS = ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")
#: Micronutrientes por 100 g. El orden es el de la tabla de la app.
NUTRIENT_KEYS = ("sugars_g", "sat_fat_g", "sodium_mg", "potassium_mg", "calcium_mg", "iron_mg",
                 "vit_c_mg", "vit_a_ug", "vit_d_ug", "vit_b12_ug", "cholesterol_mg")
#: Open Food Facts reporta minerales y vitaminas en gramos.
_OFF_NUTRIENTS = {
    "sugars_g": ("sugars_100g", 1), "sat_fat_g": ("saturated-fat_100g", 1), "sodium_mg": ("sodium_100g", 1000),
    "potassium_mg": ("potassium_100g", 1000), "calcium_mg": ("calcium_100g", 1000), "iron_mg": ("iron_100g", 1000),
    "vit_c_mg": ("vitamin-c_100g", 1000), "vit_a_ug": ("vitamin-a_100g", 1_000_000),
    "vit_d_ug": ("vitamin-d_100g", 1_000_000), "vit_b12_ug": ("vitamin-b12_100g", 1_000_000),
    "cholesterol_mg": ("cholesterol_100g", 1000),
}
CATEGORIES = {
    "cereales": "Cereales, arepas y panes", "tuberculos": "Tubérculos y plátanos", "leguminosas": "Fríjoles y leguminosas",
    "carnes": "Carnes", "aves": "Pollo y aves", "pescados": "Pescados y mariscos", "huevos": "Huevos",
    "lacteos": "Lácteos", "frutas": "Frutas", "verduras": "Verduras", "grasas": "Grasas y aceites",
    "frutos_secos": "Frutos secos y semillas", "bebidas": "Bebidas", "dulces": "Dulces y azúcares",
    "platos": "Platos colombianos", "snacks": "Paquetes y snacks", "suplementos": "Suplementos", "otros": "Otros",
}


def normalize(value: str) -> str:
    t = unicodedata.normalize("NFKD", (value or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9ñ ]", " ", t)).strip()


def search_text_for(name: str, synonyms: Iterable[str] = (), brand: Optional[str] = None) -> str:
    return " | ".join(normalize(x) for x in (name, *synonyms, brand or "") if x)


def reference_data() -> dict:
    return json.loads(REFERENCE.read_text(encoding="utf-8"))


def reference_rows() -> list[dict]:
    return reference_data()["foods"]


def _reference_fields(r: dict, version: int) -> dict:
    return {
        "name": r["name"], "category": r.get("category"), "synonyms": r.get("synonyms", []),
        "kcal": r["kcal"], **{k: r.get(k, 0) or 0 for k in MACROS if k != "kcal"},
        "nutrients": {k: r["nutrients"][k] for k in NUTRIENT_KEYS if r.get("nutrients", {}).get(k) is not None},
        "portions": r.get("portions", []), "origin": r.get("origin"),
        "search_text": search_text_for(r["name"], r.get("synonyms", [])), "data_version": version,
    }


async def seed_reference(db: AsyncSession) -> int:
    """Carga o actualiza la base de referencia cuando sube su versión.

    Actualiza por `ref_key` (o por nombre, para las filas de antes de que
    existiera la clave) en vez de borrar: los registros de comidas apuntan a
    esos ids. El candado evita que dos procesos que arrancan a la vez la
    carguen dos veces."""
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('lsmfit_foods_seed'))"))
    data = reference_data()
    version = int(data.get("version", 1))
    current = (await db.execute(select(func.max(Food.data_version)).where(Food.source == "reference"))).scalar() or 0
    if current >= version:
        await db.commit()
        return 0
    existing = (await db.execute(select(Food).where(Food.source == "reference"))).scalars().all()
    by_key = {f.ref_key: f for f in existing if f.ref_key}
    by_name = {normalize(f.name): f for f in existing if not f.ref_key}
    for r in data["foods"]:
        fields = _reference_fields(r, version)
        food = by_key.get(r["ref_key"]) or by_name.pop(normalize(r["name"]), None)
        if food is None:
            db.add(Food(source="reference", ref_key=r["ref_key"], **fields))
            continue
        food.ref_key = r["ref_key"]
        for k, v in fields.items():
            setattr(food, k, v)
    # Filas viejas sin equivalente: siguen existiendo (hay comidas que las
    # citan) pero se marcan con la versión para no reintentar en cada arranque.
    for f in by_name.values():
        f.data_version = version
        f.search_text = f.search_text or search_text_for(f.name)
    await db.commit()
    return len(data["foods"])


def packaged_data() -> Optional[dict]:
    if not PACKAGED.exists():
        return None
    with gzip.open(PACKAGED, "rt", encoding="utf-8") as fh:
        return json.load(fh)


async def seed_packaged(db: AsyncSession) -> int:
    """Carga los productos empacados cuando sube su versión. Hace upsert por
    código de barras y solo sobre filas de Open Food Facts: lo que la persona
    creó a mano nunca se pisa."""
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('lsmfit_packaged_seed'))"))
    data = packaged_data()
    if data is None:
        await db.commit()
        return 0
    version = int(data.get("version", 1))
    current = (await db.execute(select(func.max(Food.data_version)).where(
        Food.source == "openfoodfacts", Food.owner_id.is_(None)))).scalar() or 0
    if current >= version:
        await db.commit()
        return 0
    n = await upsert_packaged(db, data["products"], version)
    await db.commit()
    return n


async def upsert_packaged(db: AsyncSession, products: list[dict], version: int) -> int:
    rows = [{
        "id": uuid.uuid4(), "name": p["name"], "brand": p.get("brand"), "barcode": p["barcode"],
        "source": "openfoodfacts", "kcal": p["kcal"], "protein_g": p["protein_g"], "carbs_g": p["carbs_g"],
        "fat_g": p["fat_g"], "fiber_g": p.get("fiber_g") or 0, "portions": p.get("portions", []),
        "nutrients": p.get("nutrients", {}), "category": p.get("category"), "synonyms": [],
        "origin": "Open Food Facts (ODbL)", "search_text": search_text_for(p["name"], (), p.get("brand")),
        "data_version": version,
    } for p in products]
    updatable = ("name", "brand", "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "portions", "nutrients",
                 "category", "origin", "search_text", "data_version")
    for i in range(0, len(rows), 1000):
        stmt = pg_insert(Food).values(rows[i:i + 1000])
        stmt = stmt.on_conflict_do_update(
            index_elements=[Food.barcode], set_={k: stmt.excluded[k] for k in updatable},
            where=(Food.source == "openfoodfacts") & Food.owner_id.is_(None))
        await db.execute(stmt)
    return len(rows)


def out(f: Food) -> dict:
    return {
        "id": str(f.id), "name": f.name, "brand": f.brand, "source": f.source, "barcode": f.barcode,
        "kcal": float(f.kcal), "protein_g": float(f.protein_g), "carbs_g": float(f.carbs_g),
        "fat_g": float(f.fat_g), "fiber_g": float(f.fiber_g), "portions": f.portions or [],
        "nutrients": {k: f.nutrients.get(k) for k in NUTRIENT_KEYS if (f.nutrients or {}).get(k) is not None},
        "category": f.category, "category_label": CATEGORIES.get(f.category or "", None),
        "origin": f.origin, "mine": f.owner_id is not None, "components": f.components,
    }


def visible(user_id: uuid.UUID):
    return or_(Food.owner_id.is_(None), Food.owner_id == user_id)


async def usage_counts(db: AsyncSession, user_id: uuid.UUID, days: int = 90) -> Counter:
    since = today_bogota() - timedelta(days=days)
    rows = (await db.execute(
        select(MealEntry.food_id, func.count()).where(MealEntry.app_user_id == user_id, MealEntry.day >= since,
                                                      MealEntry.food_id.is_not(None))
        .group_by(MealEntry.food_id))).all()
    return Counter({fid: n for fid, n in rows})


#: Lo que se muestra antes de escribir: lo más comido en Colombia, no el orden alfabético.
COMMON = ["tcac_5", "tcac_10", "plato_huevos_pericos", "plato_huevo_frito", "banano_usda", "cafe_preparado",
          "pechuga_pollo_asada", "frijol_rojo_cocido", "papa_cocida_usda", "aguacate_usda", "pan_blanco_tajado",
          "leche_entera_usda", "lentejas_cocidas", "tcac_247", "lomo_res_asado", "avena_usda", "papaya",
          "mango_usda", "jugo_naranja", "tomate_usda", "plato_arepa_queso_rellena", "plato_arroz_pollo",
          "plato_ajiaco", "plato_sancocho_gallina", "plato_bandeja_paisa"]


async def search(db: AsyncSession, user_id: uuid.UUID, q: str, limit: int = 25,
                 category: Optional[str] = None) -> list[Food]:
    """Sin tildes, por sinónimos y con lo que la persona más come primero."""
    stmt = select(Food).where(visible(user_id))
    if category:
        stmt = stmt.where(Food.category == category)
    tokens = normalize(q).split()
    if not tokens and not category:
        rows = list((await db.execute(stmt.where(Food.ref_key.in_(COMMON)))).scalars().all())
        rank = {k: i for i, k in enumerate(COMMON)}
        used = await usage_counts(db, user_id)
        return sorted(rows, key=lambda f: (-used.get(f.id, 0), rank.get(f.ref_key, len(COMMON))))[:limit]
    for t in tokens[:5]:
        stmt = stmt.where(Food.search_text.contains(t))
    # Con miles de productos empacados, «arroz» trae cientos de marcas: el
    # corte de 300 se hace con los genéricos y lo propio por delante.
    packaged = case((Food.source == "openfoodfacts", 1), else_=0)
    rows = list((await db.execute(stmt.order_by(packaged, func.length(Food.name)).limit(300))).scalars().all())
    used = await usage_counts(db, user_id)
    nq = normalize(q)

    def score(f: Food) -> tuple:
        n = normalize(f.name)
        # Una marca solo sube si la persona la escribió.
        by_brand = bool(f.brand) and any(t in normalize(f.brand) for t in tokens)
        is_packaged = f.source == "openfoodfacts" and not by_brand
        return (-used.get(f.id, 0), not (nq and n.startswith(nq)), f.owner_id is None, is_packaged, len(n))

    return sorted(rows, key=score)[:limit]


async def recent(db: AsyncSession, user_id: uuid.UUID, limit: int = 15) -> list[Food]:
    rows = (await db.execute(
        select(MealEntry.food_id, func.max(MealEntry.created_at).label("last"))
        .where(MealEntry.app_user_id == user_id, MealEntry.food_id.is_not(None))
        .group_by(MealEntry.food_id).order_by(text("last DESC")).limit(limit))).all()
    ids = [r[0] for r in rows]
    if not ids:
        return []
    foods = {f.id: f for f in (await db.execute(select(Food).where(Food.id.in_(ids), visible(user_id)))).scalars()}
    return [foods[i] for i in ids if i in foods]


def scaled(grams: float, food: Food) -> dict:
    """Aporte de `grams` de un alimento: macros y micronutrientes."""
    f = grams / 100
    macros = {k: round(float(getattr(food, k) or 0) * f, 1) for k in MACROS}
    micro = {k: round(float(v) * f, 2) for k, v in (food.nutrients or {}).items()
             if k in NUTRIENT_KEYS and v is not None}
    return {**macros, "nutrients": micro}


def recipe_per100(parts: list[tuple[Food, float]]) -> dict:
    """Una receta como alimento por 100 g. Un micronutriente solo se informa si
    todos los ingredientes lo traen: sumar los que sí tienen y callar los que no
    daría una cifra menor que la real presentada como completa."""
    total = sum(g for _, g in parts)
    if total <= 0:
        raise ValueError("La receta no tiene gramos")
    macros = {k: round(sum(float(getattr(f, k) or 0) * g / 100 for f, g in parts) * 100 / total, 1) for k in MACROS}
    micro = {}
    for k in NUTRIENT_KEYS:
        vals = [(f.nutrients or {}).get(k) for f, _ in parts]
        if all(v is not None for v in vals):
            micro[k] = round(sum(float(v) * g / 100 for v, (_, g) in zip(vals, parts)) * 100 / total, 2)
    return {**macros, "nutrients": micro, "total_grams": round(total, 1)}


def _num(v) -> Optional[float]:
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return None


def parse_off(code: str, payload: dict) -> Optional[dict]:
    """Producto de Open Food Facts → alimento por 100 g, o None si no trae energía."""
    if payload.get("status") != 1:
        return None
    p = payload.get("product") or {}
    n = p.get("nutriments") or {}
    kcal = _num(n.get("energy-kcal_100g"))
    if kcal is None and _num(n.get("energy_100g")) is not None:
        kcal = round(_num(n.get("energy_100g")) / 4.184, 1)  # kJ → kcal
    name = (p.get("product_name_es") or p.get("product_name") or "").strip()
    if kcal is None or not name:
        return None
    serving = _num(p.get("serving_quantity"))
    brand = (p.get("brands") or "").split(",")[0].strip() or None
    micro = {}
    for key, (off_key, factor) in _OFF_NUTRIENTS.items():
        v = n.get(off_key)
        try:
            if v is not None and v != "":
                micro[key] = round(float(v) * factor, 2)
        except (TypeError, ValueError):
            pass
    return {
        "name": name[:200], "brand": brand, "barcode": code, "source": "openfoodfacts", "kcal": kcal,
        "protein_g": _num(n.get("proteins_100g")) or 0, "carbs_g": _num(n.get("carbohydrates_100g")) or 0,
        "fat_g": _num(n.get("fat_100g")) or 0, "fiber_g": _num(n.get("fiber_100g")) or 0,
        "portions": [{"label": "1 porción", "grams": serving}] if serving else [],
        "nutrients": micro, "category": "snacks", "origin": "Open Food Facts (ODbL)",
        "search_text": search_text_for(name, (), brand),
    }


async def fetch_off(code: str) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=6, headers={"User-Agent": USER_AGENT}) as client:
            r = await client.get(OFF_URL.format(code=code), params={"fields": OFF_FIELDS})
        if r.status_code != 200:
            return None
        return parse_off(code, r.json())
    except (httpx.HTTPError, ValueError):
        logger.warning("Open Food Facts no respondió para %s", code)
        return None


def barcode_variants(code: str) -> list[str]:
    """El mismo producto se lee como UPC-A (12 dígitos) o como EAN-13 con un
    cero adelante, y Open Food Facts lo guarda de cualquiera de las dos formas."""
    out = [code]
    if len(code) == 12:
        out.append("0" + code)
    if len(code) == 13 and code.startswith("0"):
        out.append(code[1:])
    return out


async def by_barcode(db: AsyncSession, code: str) -> Optional[Food]:
    if not re.fullmatch(r"\d{8,14}", code):
        return None
    found = (await db.execute(select(Food).where(Food.barcode.in_(barcode_variants(code)), Food.owner_id.is_(None))
                              .limit(1))).scalar_one_or_none()
    if found:
        return found
    data = await fetch_off(code)
    if not data:
        return None
    food = Food(**data)
    db.add(food)
    try:
        await db.commit()
    except IntegrityError:
        # Dos personas escanearon el mismo producto nuevo a la vez: gana la primera.
        await db.rollback()
        return (await db.execute(select(Food).where(Food.barcode == code))).scalar_one_or_none()
    return food
