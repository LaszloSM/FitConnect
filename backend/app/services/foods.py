"""Alimentos: la tabla de referencia incluida, lo que traen los códigos de barras
(Open Food Facts) y los alimentos propios de cada persona."""
from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path
from typing import Optional

import httpx
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app import Food

logger = logging.getLogger(__name__)
REFERENCE = Path(__file__).resolve().parent.parent / "data" / "foods_reference.json"
OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
OFF_FIELDS = "product_name,product_name_es,brands,nutriments,serving_quantity"
USER_AGENT = "FitConnect/0.1 (app de entrenamiento; contacto en fitconnect.co)"


def reference_rows() -> list[dict]:
    return json.loads(REFERENCE.read_text(encoding="utf-8"))["foods"]


async def seed_reference(db: AsyncSession) -> int:
    """Carga la tabla de referencia si la base está vacía de ella (idempotente).
    El candado evita que dos procesos que arrancan a la vez la carguen dos veces."""
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('fitconnect_foods_seed'))"))
    have = (await db.execute(select(func.count()).select_from(Food).where(Food.source == "reference"))).scalar() or 0
    if have:
        await db.commit()
        return 0
    rows = reference_rows()
    for r in rows:
        db.add(Food(source="reference", **r))
    await db.commit()
    return len(rows)


def out(f: Food) -> dict:
    return {
        "id": str(f.id), "name": f.name, "brand": f.brand, "source": f.source, "barcode": f.barcode,
        "kcal": float(f.kcal), "protein_g": float(f.protein_g), "carbs_g": float(f.carbs_g),
        "fat_g": float(f.fat_g), "fiber_g": float(f.fiber_g), "portions": f.portions or [],
    }


async def search(db: AsyncSession, user_id: uuid.UUID, q: str, limit: int = 20) -> list[Food]:
    stmt = select(Food).where(or_(Food.owner_id.is_(None), Food.owner_id == user_id))
    q = q.strip()
    if q:
        stmt = stmt.where(Food.name.ilike(f"%{q}%"))
    return list((await db.execute(stmt.order_by(Food.source.desc(), Food.name).limit(limit))).scalars().all())


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
    return {
        "name": name[:200], "brand": ((p.get("brands") or "").split(",")[0].strip() or None),
        "barcode": code, "source": "openfoodfacts", "kcal": kcal,
        "protein_g": _num(n.get("proteins_100g")) or 0, "carbs_g": _num(n.get("carbohydrates_100g")) or 0,
        "fat_g": _num(n.get("fat_100g")) or 0, "fiber_g": _num(n.get("fiber_100g")) or 0,
        "portions": [{"label": "1 porción", "grams": serving}] if serving else [],
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


async def by_barcode(db: AsyncSession, code: str) -> Optional[Food]:
    if not re.fullmatch(r"\d{8,14}", code):
        return None
    found = (await db.execute(select(Food).where(Food.barcode == code))).scalar_one_or_none()
    if found:
        return found
    data = await fetch_off(code)
    if not data:
        return None
    food = Food(**data)
    db.add(food)
    await db.commit()
    return food
