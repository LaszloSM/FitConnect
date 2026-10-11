"""Arma `app/data/foods_packaged.json.gz`: los productos empacados de Colombia
que encuentra el escáner sin tener que salir a internet.

Fuente: `data_sources/off_co.json.gz` (lo baja `fetch_off.py` en GitHub
Actions). Open Food Facts lo llena gente voluntaria, así que aquí se descarta
lo que no cuadra en vez de corregirlo:
- sin proteína, carbohidratos o grasa, o con valores imposibles;
- calorías que no cuadran con Atwater (4/4/9, con o sin la fibra) por más de
  25 % o 30 kcal.

    python scripts/build_packaged.py           # escribe el archivo
    python scripts/build_packaged.py --check   # falla si no está al día

Sube `VERSION` cuando cambien los datos: la app actualiza su copia cuando ve
una versión mayor. Licencia de los datos: ODbL (Open Food Facts).
"""
from __future__ import annotations

import gzip
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data_sources" / "off_co.json.gz"
OUT = ROOT / "app" / "data" / "foods_packaged.json.gz"
VERSION = 1

#: Nutriente propio -> (columna de OFF por 100 g en gramos, factor, tope creíble).
MICRO = {
    "sugars_g": ("sugars_100g", 1, 100), "sat_fat_g": ("saturated-fat_100g", 1, 100),
    "sodium_mg": ("sodium_100g", 1000, 40_000), "potassium_mg": ("potassium_100g", 1000, 10_000),
    "calcium_mg": ("calcium_100g", 1000, 5_000), "iron_mg": ("iron_100g", 1000, 200),
    "vit_c_mg": ("vitamin-c_100g", 1000, 5_000), "vit_a_ug": ("vitamin-a_100g", 1_000_000, 20_000),
    "vit_d_ug": ("vitamin-d_100g", 1_000_000, 500), "vit_b12_ug": ("vitamin-b12_100g", 1_000_000, 500),
    "cholesterol_mg": ("cholesterol_100g", 1000, 3_000),
}

#: Etiqueta de categoría de OFF (primera que coincida) -> categoría propia.
CATEGORY_TAGS = [
    ("en:breakfast-cereals", "cereales"), ("en:breads", "cereales"), ("en:pastas", "cereales"),
    ("en:rices", "cereales"), ("en:flours", "cereales"), ("en:cereals-and-potatoes", "cereales"),
    ("en:legumes", "leguminosas"), ("en:meats", "carnes"), ("en:poultries", "aves"),
    ("en:seafood", "pescados"), ("en:fishes", "pescados"), ("en:eggs", "huevos"),
    ("en:dairies", "lacteos"), ("en:cheeses", "lacteos"), ("en:yogurts", "lacteos"), ("en:milks", "lacteos"),
    ("en:fruits", "frutas"), ("en:vegetables", "verduras"), ("en:fats", "grasas"), ("en:oils", "grasas"),
    ("en:nuts", "frutos_secos"), ("en:seeds", "frutos_secos"), ("en:beverages", "bebidas"),
    ("en:sweeteners", "dulces"), ("en:confectioneries", "dulces"), ("en:chocolates", "dulces"),
    ("en:desserts", "dulces"), ("en:dietary-supplements", "suplementos"), ("en:protein-powders", "suplementos"),
    ("en:snacks", "snacks"),
]


def clean_text(s: str) -> str:
    s = re.sub(r"\s+", " ", (s or "").replace("_", " ")).strip(" ,.-")
    # Nombres en mayúsculas sostenidas («GALLETAS DUCALES») se leen mejor en oración.
    if s.isupper() and len(s) > 3:
        s = s.capitalize()
    return s[:1].upper() + s[1:]


#: Tamaños de porción que OFF trae en inglés o que solo repiten los gramos: se
#: muestran como «1 porción» (los gramos ya van en la porción).
ENGLISH_SERVING = re.compile(r"\b(portion|serving|tablespoons?|tbsp|cups?|pieces?|slices?|bars?|packs?)\b", re.I)


def kcal_of(n: dict):
    if n.get("energy-kcal_100g") is not None:
        return n["energy-kcal_100g"]
    if n.get("energy_100g") is not None:
        return n["energy_100g"] / 4.184
    return None


def coherent(kcal: float, p: float, c: float, f: float, fiber: float) -> bool:
    tol = max(kcal * 0.25, 30)
    with_fiber = 4 * p + 4 * c + 9 * f
    without = 4 * p + 4 * max(c - fiber, 0) + 9 * f + 2 * fiber
    return abs(with_fiber - kcal) <= tol or abs(without - kcal) <= tol


def category(tags: str) -> str:
    have = set((tags or "").split(","))
    return next((cat for tag, cat in CATEGORY_TAGS if tag in have), "snacks")


def r1(v: float) -> float:
    return round(float(v), 1)


def product(p: dict):
    n = p.get("n") or {}
    kcal = kcal_of(n)
    prot, carbs, fat = n.get("proteins_100g"), n.get("carbohydrates_100g"), n.get("fat_100g")
    if kcal is None or prot is None or carbs is None or fat is None:
        return None
    fiber = n.get("fiber_100g") or 0
    if not (0 <= kcal <= 900) or max(prot, carbs, fat, fiber) > 100 or prot + carbs + fat > 105:
        return None
    if not coherent(kcal, prot, carbs, fat, fiber):
        return None
    name = clean_text(p.get("name", ""))
    if len(name) < 2:
        return None
    brand = clean_text((p.get("brands") or "").split(",")[0]) or None
    micro = {}
    for key, (col, factor, cap) in MICRO.items():
        v = n.get(col)
        if v is not None and 0 <= v * factor <= cap:
            micro[key] = round(v * factor, 2)
    portions = []
    sq = p.get("serving_quantity")
    if sq and 1 <= sq <= 1000:
        size = clean_text(p.get("serving_size", ""))
        plain = not size or size.replace(" ", "").lower() in (f"{sq:g}g", f"{sq:g}ml") or ENGLISH_SERVING.search(size)
        label = "1 porción" if plain else f"1 porción ({size})"
        portions.append({"label": label[:60], "grams": r1(sq)})
    portions.append({"label": "100 g", "grams": 100})
    return {
        "barcode": p["code"], "name": name[:200], "brand": brand, "category": category(p.get("categories", "")),
        "kcal": r1(kcal), "protein_g": r1(prot), "carbs_g": r1(carbs), "fat_g": r1(fat), "fiber_g": r1(fiber),
        "nutrients": micro, "portions": portions,
    }


def build() -> dict:
    with gzip.open(SRC, "rt", encoding="utf-8") as fh:
        raw = json.load(fh)["products"]
    kept = [x for x in (product(p) for p in raw) if x]
    kept.sort(key=lambda x: x["barcode"])
    return {"version": VERSION, "source": "Open Food Facts (ODbL), productos vendidos en Colombia",
            "read": len(raw), "products": kept}


def main() -> int:
    data = build()
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if "--check" in sys.argv:
        current = gzip.open(OUT, "rt", encoding="utf-8").read() if OUT.exists() else ""
        if current != text:
            print("foods_packaged.json.gz no está al día: corre python scripts/build_packaged.py")
            return 1
        print("foods_packaged.json.gz al día")
        return 0
    # mtime fijo: el mismo contenido da el mismo archivo (y no ensucia git).
    with open(OUT, "wb") as raw_fh, gzip.GzipFile(fileobj=raw_fh, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(text.encode("utf-8"))
    by_cat: dict[str, int] = {}
    for x in data["products"]:
        by_cat[x["category"]] = by_cat.get(x["category"], 0) + 1
    print(f"{len(data['products'])} de {data['read']} productos (versión {VERSION}): {by_cat}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
