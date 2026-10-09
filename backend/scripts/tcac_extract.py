"""Lee el texto de la Tabla de Composición de Alimentos Colombianos (ICBF, TCAC
2015) que deja `pdftotext -layout` y devuelve los valores por 100 g.

El PDF no trae un formato tabular: cada tabla es más ancha que una página, así
que una fila se reparte entre una página con el nombre del alimento y una o
más «páginas de continuación» que solo tienen números. Por eso:

- Cada número se asigna a la columna cuyo encabezado («promedio») le queda
  más cerca en horizontal, con las posiciones del encabezado de ESA página.
- Las filas de una página de continuación se emparejan por su posición
  vertical. El desplazamiento entre las dos páginas se calibra por página
  (el que hace coincidir más filas con datos), porque una fila sin valores
  deja una línea en blanco y el emparejamiento por orden se corre.
- Nada se acepta a ciegas: las calorías tienen que cuadrar con Atwater
  (4·proteína + 9·grasa + 4·carbohidratos, ±15 % o ±25 kcal) y los minerales
  y vitaminas tienen que estar en rangos posibles. Lo que no cuadra se
  descarta, no se corrige.
"""
from __future__ import annotations

import re
from collections import defaultdict

PROXIMAL = "Tabla del análisis proximal de alimentos"
MINERALS = "Tabla de contenido de minerales"
WATER_VITAMINS = "Tabla de contenido de vitaminas hidrosolubles"

_TOK = re.compile(r"-?\d+(?:,\d+)?|[a-d]\*?|I")
_SUB = re.compile(r"promedio|desviación|calificaci[oó]n")
_SKIP = {"Código", "Número", "de", "GRUPO", "NOMBRE", "Grupo", "Nombre", "n", "N", "FAO",
         "Identificación", "identificación", "Tabla", "contenido", "hidrosolubles", "liposolubles"}
_ROW_PROXIMAL = re.compile(
    r"^\s*(\S{1,5})?\s+(\d{1,4})\s+([A-Z]\. .+?)\s{2,}(.+?)\s{2,}(I|\d+)\s+(\d+)\s+(\d+)\s+(.*)$")
_ROW = re.compile(r"^\s*(\S{1,5})?\s+(\d{1,4})\s+([A-Z]\. .+?)\s{2,}(.+?)\s{2,}(I|\d+)\s{2,}(.*)$")

#: Encabezado de la TCAC → clave propia, y rango posible por 100 g.
MICRO = {
    "Calcio": ("calcium_mg", 0, 2500), "Hierro": ("iron_mg", 0, 120), "Sodio": ("sodium_mg", 0, 40000),
    "Potasio": ("potassium_mg", 0, 6000), "Vitamina": ("vit_c_mg", 0, 2500),
    "Vitamina B12": ("vit_b12_ug", 0, 100),
}


def _num(s: str) -> float:
    return float(s.replace(",", "."))


def _centers(lines: list[str]) -> list[tuple[float, str]]:
    out = []
    for line in lines:
        for m in _SUB.finditer(line):
            out.append(((m.start() + m.end()) / 2, m.group()))
    return sorted(out)


def _nearest(centers: list[float], mid: float) -> int:
    return min(range(len(centers)), key=lambda i: abs(centers[i] - mid))


def _calibrate(s: int, offsets: list[int], data_lines: set[int]) -> int | None:
    """Desplazamiento vertical de una página de continuación, o None si
    ninguno explica bien sus filas (mejor perder la página que correrla)."""
    def fit(shift: int) -> tuple[int, int]:
        hit = sum(1 for o in offsets if s + o + shift in data_lines)
        return hit, hit - 2 * (len(data_lines) - hit)
    best = max(range(-4, 7), key=lambda sh: fit(sh)[1])
    hit = fit(best)[0]
    return best if data_lines and hit >= 0.8 * len(data_lines) else None


def proximal(text: str) -> dict[int, dict]:
    """Energía, proteína, grasa, carbohidratos y fibra por 100 g."""
    out: dict[int, dict] = {}
    pending: list[tuple[int, int]] = []
    names = ["prot_d", "prot_c"] + [f"{g}_{k}" for g in ("fat", "carbs", "ash", "fiber") for k in ("p", "d", "c")]
    for page in text.split("\f"):
        if PROXIMAL not in page:
            continue
        lines = page.split("\n")
        if any("Nombre" in line for line in lines[:15]):
            pending = []
            first = None
            for idx, line in enumerate(lines):
                m = _ROW_PROXIMAL.match(line)
                if not m:
                    continue
                fid = int(m.group(2))
                nums = re.findall(r"\d+,\d+|\d+", m.group(8))
                out[fid] = {"name": m.group(4).strip(), "group": m.group(3).strip(), "kcal": int(m.group(6)),
                            "protein_g": _num(nums[-1]) if nums else None}
                first = idx if first is None else first
                pending.append((fid, idx - first))
            continue
        head = next((i for i, line in enumerate(lines) if "desviación calificación promedio" in line), None)
        if head is None or not pending:
            continue
        cols = _centers(lines[head:head + 2])
        if len(cols) != len(names):
            pending = []
            continue
        centers = [c for c, _ in cols]
        start = next((i for i in range(head + 2, len(lines)) if re.search(r"\d", lines[i])), None)
        if start is None:
            pending = []
            continue
        for fid, off in pending:
            if start + off >= len(lines):
                continue
            vals = {}
            for t in _TOK.finditer(lines[start + off]):
                vals[names[_nearest(centers, (t.start() + t.end()) / 2)]] = t.group()
            for g, key in (("fat", "fat_g"), ("carbs", "carbs_g"), ("fiber", "fiber_g")):
                v = vals.get(f"{g}_p")
                out[fid][key] = _num(v) if v and re.match(r"\d", v) else None
        pending = []
    return out


def atwater_ok(f: dict) -> bool:
    if f.get("protein_g") is None or f.get("fat_g") is None or f.get("carbs_g") is None:
        return False
    est = 4 * f["protein_g"] + 9 * f["fat_g"] + 4 * f["carbs_g"]
    return abs(f["kcal"] - est) <= max(25, 0.15 * f["kcal"])


def wide_table(text: str, title: str) -> dict[int, dict[str, float]]:
    """Tabla de minerales o vitaminas: {id: {encabezado: valor}}."""
    out: dict[int, dict[str, float]] = defaultdict(dict)
    pending: list[tuple[int, int]] = []
    for page in text.split("\f"):
        if title not in page:
            continue
        lines = page.split("\n")
        s = next((i for i, line in enumerate(lines)
                  if "promedio" in line and ("desviación" in line or "calificaci" in line)), None)
        if s is None:
            continue
        sub = _centers(lines[s:s + 2])
        colname = {}
        for c, kind in sub:
            if kind != "promedio":
                continue
            words = [m.group() for j in range(max(0, s - 5), s) for m in re.finditer(r"\S+", lines[j])
                     if m.group() not in _SKIP and m.start() - 3 <= c <= m.end() + 3]
            colname[c] = " ".join(words)
        centers = [c for c, _ in sub]
        is_prom = [k == "promedio" for _, k in sub]

        def take(fid: int, line: str, offset: int = 0) -> None:
            for t in _TOK.finditer(line):
                j = _nearest(centers, offset + (t.start() + t.end()) / 2)
                if is_prom[j] and re.match(r"-?\d", t.group()):
                    out[fid][colname[centers[j]]] = _num(t.group())

        rows = [(idx, _ROW.match(line)) for idx, line in enumerate(lines) if idx > s]
        rows = [(idx, m) for idx, m in rows if m]
        if rows:
            pending = []
            for idx, m in rows:
                fid = int(m.group(2))
                pending.append((fid, idx - s))
                take(fid, m.group(6), m.start(6))
            continue
        if not pending:
            continue
        data_lines = {i for i in range(s + 1, len(lines)) if re.search(r"\d", lines[i])}
        shift = _calibrate(s, [o for _, o in pending], data_lines)
        if shift is not None:
            for fid, off in pending:
                if s + off + shift < len(lines):
                    take(fid, lines[s + off + shift])
        pending = []
    return out


def micronutrients(text: str) -> dict[int, dict[str, float]]:
    """Calcio, hierro, sodio, potasio, vitamina C y B12 que estén en rango."""
    merged: dict[int, dict[str, float]] = defaultdict(dict)
    for title in (MINERALS, WATER_VITAMINS):
        for fid, vals in wide_table(text, title).items():
            for head, v in vals.items():
                spec = MICRO.get(head)
                if spec and spec[1] <= v <= spec[2]:
                    merged[fid][spec[0]] = v
    return merged


def foods(text: str) -> dict[int, dict]:
    """Alimentos de la TCAC que pasan la verificación, con sus micronutrientes."""
    micro = micronutrients(text)
    out = {}
    for fid, f in proximal(text).items():
        if atwater_ok(f):
            out[fid] = {**f, "nutrients": micro.get(fid, {})}
    return out
