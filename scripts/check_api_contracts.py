#!/usr/bin/env python3
"""Detecta endpoints fantasma: URLs que el frontend pide y el backend no sirve.

    python scripts/check_api_contracts.py

Sale con código 1 si encuentra alguna. Sirve para correrlo antes de desplegar:
un contrato roto se ve como "Error cargando datos" en pantalla y cuesta horas
encontrarlo a mano.
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_DIR = ROOT / "backend" / "app" / "api" / "v1"
FRONT_DIRS = [ROOT / "frontend" / "app", ROOT / "frontend" / "components", ROOT / "frontend" / "hooks"]

# Plantillas que el análisis estático no puede resolver (la ruta se arma en runtime).
IGNORE = {
    "/memberships/{p}/{p}",   # `/memberships/${id}/${accion}`
}


def matches(url: str, routes: set[str]) -> bool:
    """Una URL concreta puede corresponder a una ruta con parámetros:
    `/reports/cierre/export.pdf` la sirve `/reports/{tab}/export.{fmt}`."""
    if url in routes:
        return True
    for route in routes:
        if "{p}" not in route:
            continue
        pattern = "^" + re.escape(route).replace(r"\{p\}", "[^/]+") + "$"
        if re.match(pattern, url):
            return True
    return False


def normalize(url: str) -> str:
    url = re.sub(r"\$\{[^}]*\}", "{p}", url)
    url = re.sub(r"\{[^}]*\}", "{p}", url)
    return url.rstrip("/") or "/"


def backend_routes() -> set[str]:
    routes: set[str] = set()
    for path in API_DIR.glob("*.py"):
        src = path.read_text(encoding="utf-8", errors="ignore")
        prefixes = re.findall(r'APIRouter\((?:[^)]*?)prefix="([^"]*)"', src)
        prefix = prefixes[0] if prefixes else ""
        # Un router sin prefix declara rutas absolutas (p.ej. /members/{id}/access)
        has_bare = bool(re.search(r"APIRouter\(\s*(tags=|\))", src))
        for m in re.finditer(r'@\w+\.(get|post|put|patch|delete)\("([^"]*)"', src):
            route = m.group(2)
            routes.add(normalize(prefix + route))
            if has_bare:
                routes.add(normalize(route))
    return routes


def frontend_calls() -> dict[str, set[str]]:
    calls: dict[str, set[str]] = defaultdict(set)
    for base in FRONT_DIRS:
        for path in list(base.rglob("*.tsx")) + list(base.rglob("*.ts")):
            src = path.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r'[`"](/api/v1/[^`"?]*)[`"?]', src):
                calls[normalize(m.group(1).replace("/api/v1", ""))].add(str(path.relative_to(ROOT)))
    return calls


def main() -> int:
    routes = backend_routes()
    calls = frontend_calls()
    missing = [(u, sorted(f)) for u, f in sorted(calls.items()) if not matches(u, routes) and u not in IGNORE]

    print(f"Frontend pide {len(calls)} URLs distintas · el backend declara {len(routes)} rutas")
    if not missing:
        print("Sin endpoints fantasma.")
        return 0

    print(f"\n{len(missing)} sin correspondencia en el backend:")
    for url, files in missing:
        print(f"  {url}")
        for f in files:
            print(f"      {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
