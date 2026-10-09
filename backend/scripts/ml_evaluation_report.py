"""Reporte de qué tan confiables son los modelos, con datos reales o simulados.

    python scripts/ml_evaluation_report.py --slug gym-xxxx       # un gimnasio real
    python scripts/ml_evaluation_report.py --simulate             # simulador realista
    python scripts/ml_evaluation_report.py --simulate --random    # renovar = azar: el modelo NO debe servir

El modo --random es la prueba de fuga: si con renovaciones al azar el modelo
sale "usable", algún rasgo trae la respuesta.
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.core.timeutil import today_bogota  # noqa: E402
from app.db.master_session import MasterSessionLocal  # noqa: E402
from app.models.master.tenant import Tenant  # noqa: E402
from app.services import device_directory  # noqa: E402
from app.services.ml import data, registry  # noqa: E402
from app.services.ml.simulator import simulate  # noqa: E402


def _print(results: dict) -> None:
    for name, r in results.items():
        print(f"\n== {registry.MODEL_LABELS[name]} ({name}): {r['status']}")
        if r.get("detail"):
            print("  ", r["detail"])
        m = {k: v for k, v in (r.get("metrics") or {}).items() if k not in ("drivers", "params")}
        if m:
            print("  ", json.dumps(m, ensure_ascii=False, default=str))


async def _real(slug: str) -> dict:
    async with MasterSessionLocal() as master:
        t = (await master.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none()
    if t is None:
        sys.exit(f"No existe el gimnasio {slug}")
    async with device_directory.tenant_session(t.db_name) as db:
        h = await data.load_history(db, today_bogota())
    return await asyncio.to_thread(registry.train_from_history, h)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug")
    ap.add_argument("--simulate", action="store_true")
    ap.add_argument("--random", action="store_true")
    ap.add_argument("--members", type=int, default=600)
    ap.add_argument("--seed", type=int, default=2)
    args = ap.parse_args()
    if args.simulate:
        h = simulate(today_bogota(), members=args.members, seed=args.seed, random_labels=args.random)
        _print(registry.train_from_history(h))
    elif args.slug:
        _print(asyncio.run(_real(args.slug)))
    else:
        ap.error("usa --slug o --simulate")


if __name__ == "__main__":
    main()
