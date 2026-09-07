"""Carga/actualiza la biblioteca global de ejercicios en la Master DB.

Uso (dentro del contenedor backend o con las env vars del backend):
    python scripts/import_exercises.py            # descarga el dataset
    python scripts/import_exercises.py ruta.json  # desde un archivo local
"""
import asyncio
import sys
from pathlib import Path

# El script vive en backend/scripts/: sin esto, `python scripts/import_exercises.py`
# no encuentra el paquete `app` (solo pone scripts/ en sys.path).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.master_session import MasterSessionLocal
from app.services.exercise_catalog import import_exercises, import_wger_videos, load_dataset


async def main(path: str | None) -> None:
    raw = load_dataset(path)
    async with MasterSessionLocal() as db:
        result = await import_exercises(db, raw)
    print(f"Ejercicios: {result['created']} nuevos, {result['updated']} actualizados de {result['total']}")

    # Videos reales (CC-BY-SA de wger) donde existan: son pocos pero cubren los
    # básicos. Si no hay internet, el catálogo ya quedó cargado igual.
    try:
        async with MasterSessionLocal() as db:
            v = await import_wger_videos(db)
        print(f"Videos de wger: {v['linked']} enlazados de {v['videos']} · {v['skipped_format']} descartados por formato no reproducible")
    except Exception as e:
        print(f"Videos de wger: omitidos ({type(e).__name__}: {e})")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
