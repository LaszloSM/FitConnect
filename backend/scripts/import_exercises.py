"""Carga/actualiza la biblioteca global de ejercicios en la Master DB.

Uso (dentro del contenedor backend o con las env vars del backend):
    python scripts/import_exercises.py            # descarga el dataset
    python scripts/import_exercises.py ruta.json  # desde un archivo local
"""
import asyncio
import sys

from app.db.master_session import MasterSessionLocal
from app.services.exercise_catalog import import_exercises, load_dataset


async def main(path: str | None) -> None:
    raw = load_dataset(path)
    async with MasterSessionLocal() as db:
        result = await import_exercises(db, raw)
    print(f"Ejercicios: {result['created']} nuevos, {result['updated']} actualizados de {result['total']}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
