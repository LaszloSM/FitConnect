"""Entrenar, guardar y cargar los modelos de un gimnasio.

El trabajo de CPU corre en un hilo (`asyncio.to_thread`): el scheduler vive en
el mismo proceso que la API y un entrenamiento síncrono congelaría todas las
peticiones mientras dura.
"""
from __future__ import annotations

import asyncio
import io
import logging
from datetime import timedelta

import joblib
import numpy as np
import sklearn
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import now_bogota, today_bogota
from app.models.tenant.ml_model import MlModel
from app.services.ml import anomalies, churn, data, forecast, occupancy, pricing, segments

logger = logging.getLogger(__name__)

MODEL_LABELS = {
    "churn": "Riesgo de abandono",
    "forecast": "Ingresos del mes",
    "segments": "Segmentos de socios",
    "anomalies": "Días fuera de lo normal",
    "occupancy": "Aforo de la semana",
    "pricing": "Reacción al precio",
}
MODEL_METHODS = {
    "churn": "Gradient boosting",
    "forecast": "Holt-Winters semanal",
    "segments": "K-means",
    "anomalies": "Isolation Forest",
    "occupancy": "Regresión ponderada día × hora",
    "pricing": "Elasticidad por plan",
}


def _train_churn(h: data.History) -> dict:
    X, y, snap = data.churn_dataset(h)
    model = churn.train(np.array(X), np.array(y), np.array(snap))
    buf = io.BytesIO()
    joblib.dump(model, buf)
    usable = model.metrics["usable"]
    return {
        "status": "trained" if usable else "weak",
        "detail": None if usable else f"El modelo todavía acierta poco (AUC {model.metrics['auc']}): se siguen usando las reglas.",
        "n_samples": model.metrics["samples"],
        "metrics": {**model.metrics, "drivers": churn.drivers(model)},
        "payload": buf.getvalue(),
    }


def _train_forecast(h: data.History) -> dict:
    inicio = max(filter(None, [h.first_activity, h.start])) if h.first_activity else h.today
    _, ingresos, _ = data.daily_arrays(h, inicio, h.today)
    modelo = forecast.fit(ingresos)
    prueba = forecast.backtest(ingresos)
    peor = (
        prueba["model_error_pct"] is not None
        and prueba["pace_error_pct"] is not None
        and prueba["model_error_pct"] > prueba["pace_error_pct"]
    )
    return {
        "status": "weak" if peor else "trained",
        "detail": (
            f"En las últimas 2 semanas el modelo erró {prueba['model_error_pct']}% y el ritmo lineal "
            f"{prueba['pace_error_pct']}%: por ahora se usa el ritmo."
        ) if peor else None,
        "n_samples": len(ingresos),
        "metrics": {"days": len(ingresos), "params": list(modelo.params), "backtest": prueba},
    }


def _train_segments(h: data.History) -> dict:
    ids, X = data.segment_matrix(h)
    labels, grupos = segments.segment(np.array(X))
    for g in grupos:
        g["member_ids"] = [str(ids[i]) for i in np.flatnonzero(labels == g["cluster"])]
    return {
        "status": "trained",
        "n_samples": len(ids),
        "metrics": {"members": len(ids), "groups": len(grupos), "silhouette": grupos[0]["silhouette"]},
        "result": {"groups": grupos},
    }


def _train_anomalies(h: data.History) -> dict:
    inicio = max(h.first_activity or h.today, h.today - timedelta(days=120))
    dias, ingresos, entradas = data.daily_arrays(h, inicio, h.today)
    items = anomalies.detect(dias, ingresos, entradas)
    return {"status": "trained", "n_samples": len(dias), "metrics": {"days": len(dias), "flagged": len(items)}, "result": {"items": items}}


def _train_occupancy(h: data.History) -> dict:
    grid, dias = occupancy.expected_grid(data.local_visits(h), h.today)
    return {
        "status": "trained", "n_samples": dias, "metrics": {"days_with_visits": dias},
        "result": {**occupancy.next_week(grid, h.today), "computed_for": h.today.isoformat()},
    }


def _train_pricing(h: data.History) -> dict:
    planes = pricing.plan_elasticity(data.pricing_rows(h))
    medibles = [p for p in planes if p["elasticity"] is not None]
    if not medibles:
        return {
            "status": "insufficient_data", "n_samples": sum(p["memberships"] for p in planes),
            "detail": "Ningún plan ha tenido dos precios distintos con suficientes ventas para medir la reacción.",
            "result": {"plans": planes},
        }
    return {"status": "trained", "n_samples": sum(p["memberships"] for p in planes), "metrics": {"plans_measured": len(medibles)}, "result": {"plans": planes}}


TRAINERS = {
    "churn": _train_churn,
    "forecast": _train_forecast,
    "segments": _train_segments,
    "anomalies": _train_anomalies,
    "occupancy": _train_occupancy,
    "pricing": _train_pricing,
}


def train_from_history(h: data.History) -> dict[str, dict]:
    """Síncrono y sin base de datos: lo que corre en el hilo."""
    salida = {}
    for name, trainer in TRAINERS.items():
        try:
            salida[name] = trainer(h)
        except (churn.InsufficientData, ValueError) as exc:
            salida[name] = {"status": "insufficient_data", "detail": str(exc)[:500], "n_samples": 0}
        except Exception as exc:  # noqa: BLE001 — un modelo roto no tumba a los demás
            logger.exception("Entrenamiento de %s falló", name)
            salida[name] = {"status": "failed", "detail": f"Error interno: {type(exc).__name__}", "n_samples": 0}
    return salida


async def train_all(db: AsyncSession) -> dict[str, str]:
    h = await data.load_history(db, today_bogota())
    resultados = await asyncio.to_thread(train_from_history, h)
    ahora = now_bogota()
    existentes = {m.name: m for m in (await db.execute(select(MlModel))).scalars().all()}
    for name, r in resultados.items():
        fila = existentes.get(name) or MlModel(name=name)
        fila.status = r["status"]
        fila.detail = r.get("detail")
        fila.trained_at = ahora
        fila.n_samples = int(r.get("n_samples") or 0)
        fila.metrics = r.get("metrics")
        fila.result = r.get("result")
        fila.payload = r.get("payload")
        fila.sklearn_version = sklearn.__version__
        if name not in existentes:
            db.add(fila)
    await db.commit()
    return {name: r["status"] for name, r in resultados.items()}


async def get(db: AsyncSession, name: str) -> MlModel | None:
    return (await db.execute(select(MlModel).where(MlModel.name == name))).scalar_one_or_none()


def load_churn(row: MlModel | None) -> churn.ChurnModel | None:
    """Un modelo serializado con otra versión de scikit-learn no se usa: se
    cae a las reglas hasta el próximo entrenamiento en vez de arriesgar un error."""
    if not row or row.status != "trained" or not row.payload or row.sklearn_version != sklearn.__version__:
        return None
    try:
        return joblib.load(io.BytesIO(row.payload))
    except Exception:  # noqa: BLE001
        logger.warning("No se pudo cargar el modelo de abandono; se usan reglas")
        return None


async def status(db: AsyncSession) -> list[dict]:
    filas = {m.name: m for m in (await db.execute(select(MlModel))).scalars().all()}
    salida = []
    for name, label in MODEL_LABELS.items():
        m = filas.get(name)
        salida.append({
            "name": name,
            "label": label,
            "method": MODEL_METHODS[name],
            "status": m.status if m else "never_trained",
            "detail": m.detail if m else "Se entrena cada noche con los datos del gimnasio.",
            "trained_at": m.trained_at.isoformat() if m else None,
            "n_samples": m.n_samples if m else 0,
            "metrics": {k: v for k, v in (m.metrics or {}).items() if k != "drivers"} if m else {},
        })
    return salida
