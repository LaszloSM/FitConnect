"""Productos empacados de Colombia (Open Food Facts) en la búsqueda y el escáner."""
import gzip
import json
import sys
from pathlib import Path

from sqlalchemy import delete

from app.db.app_db import app_session
from app.models.app import Food
from app.services import foods
from tests.test_app_nutrition import _ready_user

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_packaged  # noqa: E402

CODES = ["7709990000017", "7709990000024", "070999000003"]
PRODUCTS = [
    {"barcode": CODES[0], "name": "Arroz blanco premium tipo test", "brand": "Marcatest", "category": "cereales",
     "kcal": 357, "protein_g": 7, "carbs_g": 79, "fat_g": 0.6, "fiber_g": 1.2,
     "nutrients": {"sodium_mg": 5}, "portions": [{"label": "100 g", "grams": 100}]},
    {"barcode": CODES[1], "name": "Galletas de avena test", "brand": "Otratest", "category": "snacks",
     "kcal": 450, "protein_g": 7, "carbs_g": 68, "fat_g": 16, "fiber_g": 4,
     "nutrients": {}, "portions": [{"label": "1 porción", "grams": 30}, {"label": "100 g", "grams": 100}]},
    {"barcode": CODES[2], "name": "Bebida de soya test", "brand": None, "category": "bebidas",
     "kcal": 45, "protein_g": 3.3, "carbs_g": 3, "fat_g": 1.8, "fiber_g": 0,
     "nutrients": {}, "portions": [{"label": "100 g", "grams": 100}]},
]


async def _load():
    async with app_session() as db:
        # Versión 0: no adelanta la versión de la base real de empacados.
        await foods.upsert_packaged(db, PRODUCTS, 0)
        await db.commit()


async def _clean():
    async with app_session() as db:
        await db.execute(delete(Food).where(Food.barcode.in_(CODES + ["0" + CODES[2]])))
        await db.commit()


async def test_packaged_products_are_found_by_barcode_without_internet(client, monkeypatch):
    async def no_network(code):
        raise AssertionError("no debía salir a Open Food Facts")
    monkeypatch.setattr(foods, "fetch_off", no_network)
    h = await _ready_user(client)
    await _load()
    try:
        r = await client.get(f"/api/v1/me/foods/barcode/{CODES[1]}", headers=h)
        assert r.status_code == 200 and r.json()["name"] == "Galletas de avena test"
        assert r.json()["portions"][0] == {"label": "1 porción", "grams": 30}
        # El mismo producto leído como EAN-13 con un cero adelante.
        r = await client.get(f"/api/v1/me/foods/barcode/0{CODES[2]}", headers=h)
        assert r.status_code == 200 and r.json()["name"] == "Bebida de soya test"
    finally:
        await _clean()


async def test_generic_foods_rank_above_brands_unless_the_brand_is_typed(client):
    h = await _ready_user(client)
    await _load()
    try:
        names = [f["name"] for f in (await client.get("/api/v1/me/foods", params={"q": "arroz"}, headers=h)).json()]
        assert "Arroz blanco premium tipo test" in names
        assert names.index("Arroz blanco, cocido") < names.index("Arroz blanco premium tipo test")
        first = (await client.get("/api/v1/me/foods", params={"q": "arroz marcatest"}, headers=h)).json()[0]
        assert first["name"] == "Arroz blanco premium tipo test" and first["brand"] == "Marcatest"
    finally:
        await _clean()


async def test_reloading_updates_the_packaged_product(client):
    h = await _ready_user(client)
    await _load()
    try:
        changed = [{**PRODUCTS[0], "kcal": 350}]
        async with app_session() as db:
            await foods.upsert_packaged(db, changed, 0)
            await db.commit()
        r = (await client.get(f"/api/v1/me/foods/barcode/{CODES[0]}", headers=h)).json()
        assert r["kcal"] == 350
    finally:
        await _clean()


def test_builder_drops_incoherent_and_incomplete_products():
    ok = {"code": "7701", "name": "GALLETAS DUCALES", "brands": "noel,nutresa", "serving_quantity": 30,
          "serving_size": "30 g", "categories": "en:snacks,en:biscuits",
          "n": {"energy-kcal_100g": 486, "proteins_100g": 7, "carbohydrates_100g": 64, "fat_100g": 22}}
    p = build_packaged.product(ok)
    assert p["name"] == "Galletas ducales" and p["brand"] == "noel" and p["category"] == "snacks"
    assert p["portions"][0] == {"label": "1 porción", "grams": 30.0}
    # 900 kcal declaradas con macros que suman 300: no cuadra con Atwater.
    assert build_packaged.product({**ok, "n": {**ok["n"], "energy-kcal_100g": 900}}) is None
    # Sin grasa declarada no se puede contar.
    assert build_packaged.product({**ok, "n": {k: v for k, v in ok["n"].items() if k != "fat_100g"}}) is None
    # Energía en kJ.
    kj = {**ok, "n": {**{k: v for k, v in ok["n"].items() if k != "energy-kcal_100g"}, "energy_100g": 2033}}
    assert build_packaged.product(kj)["kcal"] == 485.9


def test_packaged_file_matches_the_builder_when_present():
    if not foods.PACKAGED.exists() or not build_packaged.SRC.exists():
        return
    with gzip.open(foods.PACKAGED, "rt", encoding="utf-8") as fh:
        assert json.load(fh) == build_packaged.build()
