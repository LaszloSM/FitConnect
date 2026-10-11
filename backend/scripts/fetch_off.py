"""Extracto de Open Food Facts con los productos que se venden en Colombia.

Baja el export completo de OFF (CSV separado por tabuladores, ~1 GB comprimido),
lo lee en streaming y guarda solo los productos con `en:colombia` entre sus
países y con energía por 100 g. Corre en GitHub Actions
(`.github/workflows/fuentes-alimentos.yml`): el proxy del entorno de desarrollo
no deja pasar la descarga. La curaduría (coherencia de calorías, nombres) la
hace después `scripts/build_foods.py`, sin red.

Licencia: Open Database License (ODbL) 1.0. Los datos se citan como «Open Food
Facts» en la app y en docs/APP_MOVIL.md.
"""
import csv
import gzip
import io
import json
import sys
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data_sources" / "off_co.json.gz"
URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
UA = {"User-Agent": "LSMFit/1.0 (datos de nutricion; contacto lsmfit.business@gmail.com)"}
COUNTRY = "en:colombia"

#: Columnas que se conservan, tal como vienen (por 100 g, en gramos).
KEEP = [
    "energy-kcal_100g", "energy_100g", "proteins_100g", "carbohydrates_100g", "fat_100g", "fiber_100g",
    "sugars_100g", "saturated-fat_100g", "sodium_100g", "potassium_100g", "calcium_100g", "iron_100g",
    "vitamin-c_100g", "vitamin-a_100g", "vitamin-d_100g", "vitamin-b12_100g", "cholesterol_100g",
]


def _num(v: str):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x >= 0 else None


def rows(stream):
    csv.field_size_limit(sys.maxsize)
    text = io.TextIOWrapper(gzip.GzipFile(fileobj=stream), encoding="utf-8", errors="replace", newline="")
    yield from csv.DictReader(text, delimiter="\t", quoting=csv.QUOTE_NONE)


def pick(row: dict):
    if COUNTRY not in (row.get("countries_tags") or "").split(","):
        return None
    code = (row.get("code") or "").strip()
    name = (row.get("product_name_es") or row.get("product_name") or "").strip()
    if not code.isdigit() or not 8 <= len(code) <= 14 or not name:
        return None
    n = {k: _num(row.get(k)) for k in KEEP}
    if n["energy-kcal_100g"] is None and n["energy_100g"] is None:
        return None
    return {
        "code": code, "name": name[:200], "brands": (row.get("brands") or "").strip()[:120],
        "quantity": (row.get("quantity") or "").strip()[:60],
        "serving_quantity": _num(row.get("serving_quantity")),
        "serving_size": (row.get("serving_size") or "").strip()[:60],
        "categories": (row.get("categories_tags") or "")[:400],
        "image": (row.get("image_small_url") or "").strip(),
        "n": {k: v for k, v in n.items() if v is not None},
    }


def main() -> int:
    req = urllib.request.Request(URL, headers=UA)
    kept, seen = {}, 0
    with urllib.request.urlopen(req, timeout=600) as r:
        for row in rows(r):
            seen += 1
            p = pick(row)
            if p is not None:
                kept[p["code"]] = p  # el export trae duplicados; queda el último
            if seen % 500_000 == 0:
                print(f"  {seen:,} filas, {len(kept):,} de Colombia", flush=True)
    # Open Food Facts tiene pocos productos de Colombia (~1.000 con energía en 2026).
    if len(kept) < 300:
        print(f"Sospechoso: solo {len(kept)} productos de Colombia en {seen:,} filas", file=sys.stderr)
        return 1
    OUT.parent.mkdir(exist_ok=True)
    data = sorted(kept.values(), key=lambda p: p["code"])
    body = json.dumps({"source": "Open Food Facts (ODbL)", "url": URL, "products": data}, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")
    # Fecha fija en el gzip: sin cambios reales no hay commit del robot.
    with open(OUT, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(body)
    print(f"Open Food Facts: {len(data):,} productos de Colombia de {seen:,} filas -> {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
