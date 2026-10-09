"""Arma `app/data/foods_reference.json`, la base de alimentos que trae la app.

Fuentes (en `backend/data_sources/`, las baja `fetch_food_sources.py`):
- ICBF, Tabla de Composición de Alimentos Colombianos 2015: los alimentos
  colombianos, verificados por `tcac_extract.py`.
- USDA FoodData Central (dominio público): lo que la TCAC no trae.
- Platos colombianos: recetas de `foods_curated.RECIPES`, calculadas sumando
  sus ingredientes.

    python scripts/build_foods.py           # escribe el JSON
    python scripts/build_foods.py --check   # falla si el JSON no está al día

Sube `VERSION` cada vez que cambien los datos: la app actualiza su copia
cuando ve una versión mayor.
"""
from __future__ import annotations

import gzip
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import foods_curated as cur  # noqa: E402
import tcac_extract  # noqa: E402

VERSION = 2
SOURCES = ROOT / "data_sources"
OUT = ROOT / "app" / "data" / "foods_reference.json"
NUTRIENTS = ("sugars_g", "sat_fat_g", "sodium_mg", "potassium_mg", "calcium_mg", "iron_mg",
             "vit_c_mg", "vit_a_ug", "vit_d_ug", "vit_b12_ug", "cholesterol_mg")


def norm(s: str) -> str:
    t = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def r1(v):
    return None if v is None else round(float(v), 1)


def r2(v):
    return None if v is None else round(float(v), 2)


def portions_for(name: str, explicit=None) -> list[dict]:
    rows = list(explicit or [])
    if not rows:
        n = norm(name)
        rows = next((p for key, p in cur.PORTIONS if key in n), [])
    return [{"label": label, "grams": grams} for label, grams in rows] + [{"label": "100 g", "grams": 100}]


def synonyms_for(name: str, extra=()) -> list[str]:
    n = norm(name)
    out = list(extra)
    for key, syns in cur.SYNONYMS.items():
        if key in n:
            out += syns
    seen, uniq = set(), []
    for s in out:
        if norm(s) not in seen and norm(s) not in n:
            seen.add(norm(s))
            uniq.append(s)
    return uniq


def category_for_tcac(name: str, group: str) -> str:
    n = norm(name)
    for prefix, cat in cur.CATEGORY_BY_PREFIX:
        if n.startswith(prefix):
            return cat
    return cur.TCAC_GROUPS.get(group[:1], "otros")


def tcac_rows() -> dict[str, dict]:
    path = SOURCES / "tcac" / "tcac_2015_final_para_imprimir.txt.gz"
    text = gzip.open(path, "rt", encoding="utf-8").read()
    out = {}
    for fid, f in tcac_extract.foods(text).items():
        name = re.sub(r"\s+", " ", f["name"]).strip()
        # Nombres que el PDF partió en dos líneas salen truncados o vacíos.
        if fid in cur.TCAC_EXCLUDE or len(name) < 3 or not name[0].isupper():
            continue
        out[f"tcac:{fid}"] = {
            "ref_key": f"tcac_{fid}", "name": name, "category": category_for_tcac(name, f["group"]),
            "synonyms": synonyms_for(name), "kcal": float(f["kcal"]), "protein_g": r1(f["protein_g"]),
            "carbs_g": r1(f["carbs_g"]), "fat_g": r1(f["fat_g"]), "fiber_g": r1(f.get("fiber_g")) or 0.0,
            "nutrients": {k: r2(v) for k, v in f["nutrients"].items()},
            "portions": portions_for(name), "origin": f"ICBF, TCAC 2015 (código {fid})",
        }
    return out


def usda_rows() -> dict[str, dict]:
    raw = {}
    for kind in ("sr_legacy", "foundation"):
        for r in json.load(gzip.open(SOURCES / f"usda_{kind}.json.gz", "rt", encoding="utf-8")):
            raw[r["fdc_id"]] = (kind, r)
    out = {}
    missing = []
    for fdc, key, name, category, syns, portions in cur.USDA:
        if fdc not in raw:
            missing.append(fdc)
            continue
        kind, r = raw[fdc]
        n = r["n"]
        kcal = n.get("kcal") or n.get("kcal_atwater_general") or n.get("kcal_atwater_specific")
        if kcal is None:
            missing.append(fdc)
            continue
        out[f"usda:{fdc}"] = {
            "ref_key": key, "name": name, "category": category, "synonyms": synonyms_for(name, syns),
            "kcal": r1(kcal), "protein_g": r1(n.get("protein_g") or 0), "carbs_g": r1(n.get("carbs_g") or 0),
            "fat_g": r1(n.get("fat_g") or 0), "fiber_g": r1(n.get("fiber_g") or 0),
            "nutrients": {k: r2(n[k]) for k in NUTRIENTS if n.get(k) is not None},
            "portions": portions_for(name, portions),
            "origin": f"USDA FoodData Central, {'SR Legacy' if kind == 'sr_legacy' else 'Foundation'} {fdc}",
        }
    if missing:
        raise SystemExit(f"USDA sin estos fdc_id (o sin energía): {missing}")
    return out


def recipe_rows(base: dict[str, dict]) -> list[dict]:
    out = []
    water = {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "fiber_g": 0.0,
             "nutrients": {k: 0.0 for k in NUTRIENTS}, "name": "Agua"}
    for key, name, portions, parts in cur.RECIPES:
        items = []
        for ref, grams in parts:
            if ref == "agua":
                items.append((water, grams))
                continue
            if ref not in base:
                raise SystemExit(f"La receta {key} usa {ref}, que no está en la base (¿no pasó la verificación?)")
            items.append((base[ref], grams))
        total = sum(g for _, g in items)
        macros = {k: round(sum((f[k] or 0) * g for f, g in items) / total, 1)
                  for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}
        micro = {}
        for k in NUTRIENTS:
            vals = [f["nutrients"].get(k) for f, _ in items]
            if all(v is not None for v in vals):
                micro[k] = round(sum(v * g for v, (_, g) in zip(vals, items)) / total, 2)
        label = portions[0][0]
        out.append({
            "ref_key": f"plato_{key}", "name": name, "category": "platos", "synonyms": synonyms_for(name),
            **macros, "nutrients": micro,
            "portions": [{"label": label, "grams": round(total)}, {"label": "100 g", "grams": 100}],
            "origin": "Estimado por receta: " + ", ".join(f"{f['name']} {g:g} g" for f, g in items),
        })
    return out


def build() -> dict:
    tcac = tcac_rows()
    usda = usda_rows()
    base = {**tcac, **usda}
    foods = list(tcac.values()) + list(usda.values()) + recipe_rows(base)
    keys = [f["ref_key"] for f in foods]
    dup = {k for k in keys if keys.count(k) > 1}
    if dup:
        raise SystemExit(f"Claves repetidas: {sorted(dup)}")
    for f in foods:
        if f["kcal"] is None or f["kcal"] < 0 or any(f[k] is None for k in ("protein_g", "carbs_g", "fat_g")):
            raise SystemExit(f"Valores incompletos en {f['ref_key']}")
    foods.sort(key=lambda f: (f["category"], norm(f["name"])))
    return {
        "version": VERSION,
        "sources": [
            "ICBF. Tabla de Composición de Alimentos Colombianos (TCAC), 2015.",
            "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central (SR Legacy 2018 y "
            "Foundation Foods 2026). Dominio público.",
            "Platos colombianos: estimados por receta a partir de las dos fuentes anteriores.",
        ],
        "foods": foods,
    }


def main() -> int:
    data = build()
    text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("foods_reference.json no está al día: corre python scripts/build_foods.py")
            return 1
        print("foods_reference.json al día")
        return 0
    OUT.write_text(text, encoding="utf-8")
    by_cat: dict[str, int] = {}
    for f in data["foods"]:
        by_cat[f["category"]] = by_cat.get(f["category"], 0) + 1
    print(f"{len(data['foods'])} alimentos (versión {VERSION}): {by_cat}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
