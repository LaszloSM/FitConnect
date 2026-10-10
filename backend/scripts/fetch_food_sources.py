"""Baja las fuentes públicas de composición de alimentos y deja un extracto
compacto en `backend/data_sources/`. Corre en GitHub Actions
(`.github/workflows/fuentes-alimentos.yml`), que sí llega a los servidores de
USDA y del ICBF; la base curada que usa la app se arma después, sin red, con
`scripts/build_foods.py`.

Fuentes:
- USDA FoodData Central, SR Legacy (abril 2018) y Foundation Foods. Dominio
  público (CC0).
- ICBF, Tabla de Composición de Alimentos Colombianos (TCAC 2018). Solo se
  publica en PDF: se guarda el texto extraído para curarlo a mano.
"""
import csv
import gzip
import io
import json
import re
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data_sources"
UA = {"User-Agent": "LSMFit/1.0 (datos de nutricion; contacto lsmfit.business@gmail.com)"}

USDA = {
    "sr_legacy": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
    "foundation": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip",
}
# Número de nutriente (el estable entre releases) -> clave propia.
NUTRIENTS = {
    "208": "kcal", "203": "protein_g", "204": "fat_g", "205": "carbs_g", "291": "fiber_g",
    "269": "sugars_g", "606": "sat_fat_g", "307": "sodium_mg", "306": "potassium_mg",
    "301": "calcium_mg", "303": "iron_mg", "401": "vit_c_mg", "320": "vit_a_ug",
    "328": "vit_d_ug", "418": "vit_b12_ug", "601": "cholesterol_mg",
    # Foundation trae la energía como Atwater general/específico en vez de 208.
    "957": "kcal_atwater_general", "958": "kcal_atwater_specific",
}
TCAC_PAGES = [
    "https://www.icbf.gov.co/tabla-de-composicion-de-alimentos-colombianos-tcac-2018",
    "https://www.icbf.gov.co/portafolio-de-servicios-icbf/tabla-de-composicion-de-alimentos-colombianos-tcac",
    "https://www.icbf.gov.co/node/103086",
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def read_csv(z: zipfile.ZipFile, name: str):
    path = next((n for n in z.namelist() if n.endswith("/" + name) or n == name), None)
    if path is None:
        return []
    with z.open(path) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")))


def extract_usda(kind: str, url: str) -> int:
    z = zipfile.ZipFile(io.BytesIO(fetch(url)))
    nutr = {r["id"]: NUTRIENTS[r["nutrient_nbr"].split(".")[0]]
            for r in read_csv(z, "nutrient.csv")
            if r.get("nutrient_nbr", "").split(".")[0] in NUTRIENTS}
    cats = {r["id"]: r["description"] for r in read_csv(z, "food_category.csv")}
    units = {r["id"]: r["name"] for r in read_csv(z, "measure_unit.csv")}
    wanted = {"sr_legacy_food", "foundation_food"}
    foods = {}
    for r in read_csv(z, "food.csv"):
        if r["data_type"] in wanted:
            foods[r["fdc_id"]] = {"fdc_id": int(r["fdc_id"]), "description": r["description"],
                                  "category": cats.get(r.get("food_category_id", ""), ""),
                                  "n": {}, "portions": []}
    for r in read_csv(z, "food_nutrient.csv"):
        f = foods.get(r["fdc_id"])
        key = nutr.get(r["nutrient_id"])
        if f is None or key is None or r["amount"] in ("", None):
            continue
        f["n"][key] = round(float(r["amount"]), 3)
    for r in read_csv(z, "food_portion.csv"):
        f = foods.get(r["fdc_id"])
        if f is None or not r.get("gram_weight"):
            continue
        unit = units.get(r.get("measure_unit_id", ""), "")
        unit = "" if unit in ("undetermined", "") else unit
        label = " ".join(x for x in (r.get("amount", ""), unit, r.get("modifier", ""),
                                     r.get("portion_description", "")) if x).strip()
        f["portions"].append([label, round(float(r["gram_weight"]), 1)])
    rows = sorted(foods.values(), key=lambda x: x["fdc_id"])
    with gzip.open(OUT / f"usda_{kind}.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False, separators=(",", ":"))
    return len(rows)


def extract_tcac() -> list[str]:
    """Busca en las páginas de la TCAC los enlaces a PDF/Excel y extrae su texto."""
    dest = OUT / "tcac"
    dest.mkdir(exist_ok=True)
    found: list[str] = []
    for page in TCAC_PAGES:
        try:
            html = fetch(page).decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"  TCAC: no abrió {page}: {e}")
            continue
        for href in re.findall(r'href="([^"]+\.(?:pdf|xlsx?|csv))"', html, flags=re.I):
            url = href if href.startswith("http") else "https://www.icbf.gov.co" + href
            if "tcac" in url.lower() and url not in found:
                found.append(url)
    (dest / "enlaces.txt").write_text("\n".join(found) + "\n", encoding="utf-8")
    for url in found:
        name = re.sub(r"[^\w.-]", "_", url.rsplit("/", 1)[-1])[:120]
        try:
            data = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"  TCAC: no bajó {url}: {e}")
            continue
        if name.lower().endswith(".pdf"):
            pdf = Path("/tmp") / name
            pdf.write_bytes(data)
            txt = dest / (name[:-4] + ".txt")
            subprocess.run(["pdftotext", "-layout", str(pdf), str(txt)], check=False)
            if txt.exists() and txt.stat().st_size > 2_000_000:
                with open(txt, "rb") as src, gzip.open(str(txt) + ".gz", "wb") as dst:
                    dst.write(src.read())
                txt.unlink()
        else:
            (dest / name).write_bytes(data)
    return found


def main() -> int:
    OUT.mkdir(exist_ok=True)
    ok = True
    for kind, url in USDA.items():
        try:
            print(f"USDA {kind}: {extract_usda(kind, url)} alimentos")
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f"USDA {kind}: falló ({e})")
    try:
        print(f"TCAC: {len(extract_tcac())} archivos enlazados")
    except Exception as e:  # noqa: BLE001
        print(f"TCAC: falló ({e})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
