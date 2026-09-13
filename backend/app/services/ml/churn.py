"""Abandono: gradient boosting sobre el historial propio del gimnasio.

Cada fila es un socio visto en una fecha de corte T; la etiqueta dice si a los
30-45 días seguía (membresía vigente o visitas) o no. Se entrena con cortes
viejos y se evalúa con el más reciente: así se mide lo que de verdad importa,
predecir hacia adelante.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

# (clave, etiqueta legible, cómo se lee el valor)
FEATURES: list[tuple[str, str]] = [
    ("days_since_last_visit", "días sin venir"),
    ("visits_30", "visitas en los últimos 30 días"),
    ("visits_prev_30", "visitas en los 30 días anteriores"),
    ("visit_trend", "tendencia de visitas"),
    ("tenure_days", "días de antigüedad"),
    ("renewals", "renovaciones"),
    ("days_to_end", "días para que venza"),
    ("membership_active", "membresía vigente"),
    ("weekdays_60", "días distintos de la semana que viene"),
    ("plan_days", "duración del plan"),
    ("paid_180", "miles pagados en 6 meses"),
]
FEATURE_KEYS = [k for k, _ in FEATURES]

MIN_SAMPLES = 80
MIN_PER_CLASS = 8
MIN_AUC = 0.6


@dataclass
class ChurnModel:
    estimator: HistGradientBoostingClassifier
    medians: list[float]
    risky_high: list[bool]
    importances: list[float]
    metrics: dict = field(default_factory=dict)


class InsufficientData(Exception):
    """No hay historial suficiente para entrenar algo en lo que confiar."""


def train(X: np.ndarray, y: np.ndarray, snapshot: np.ndarray | None = None) -> ChurnModel:
    """`snapshot` = índice del corte (0 = el más reciente) para validar hacia adelante."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=int)
    positivos = int(y.sum())
    if len(y) < MIN_SAMPLES or positivos < MIN_PER_CLASS or len(y) - positivos < MIN_PER_CLASS:
        raise InsufficientData(
            f"hacen falta {MIN_SAMPLES} casos con al menos {MIN_PER_CLASS} abandonos y {MIN_PER_CLASS} permanencias "
            f"(hay {len(y)} casos, {positivos} abandonos)"
        )

    validacion = "temporal"
    if snapshot is not None:
        test = snapshot == 0
        train_mask = ~test
        if len(set(y[test])) < 2 or train_mask.sum() < MIN_SAMPLES * 0.6 or len(set(y[train_mask])) < 2:
            test = None
    else:
        test = None
    if test is None:
        validacion = "aleatoria estratificada"
        idx = np.arange(len(y))
        tr, te = train_test_split(idx, test_size=0.25, stratify=y, random_state=0)
        train_mask = np.zeros(len(y), bool)
        train_mask[tr] = True
        test = ~train_mask

    est = HistGradientBoostingClassifier(
        max_iter=200, learning_rate=0.08, max_leaf_nodes=15, l2_regularization=1.0,
        class_weight="balanced", random_state=0,
    )
    est.fit(X[train_mask], y[train_mask])
    proba = est.predict_proba(X[test])[:, 1]
    auc = float(roc_auc_score(y[test], proba))

    # Tres repeticiones bastan para ordenar los rasgos; cinco duplicaban el tiempo
    # del job nocturno por gimnasio sin cambiar el orden.
    imp = permutation_importance(est, X[test], y[test], scoring="roc_auc", n_repeats=3, random_state=0)
    importancias = np.clip(imp.importances_mean, 0, None)
    if importancias.sum() == 0:
        importancias = np.ones(X.shape[1])
    importancias = importancias / importancias.sum()

    # Para explicar hace falta saber hacia dónde es "riesgoso" cada rasgo.
    risky_high = [bool(X[y == 1, j].mean() > X[y == 0, j].mean()) for j in range(X.shape[1])]

    # Modelo final con todo el historial.
    est.fit(X, y)
    return ChurnModel(
        estimator=est,
        medians=[float(v) for v in np.median(X[y == 0], axis=0)],
        risky_high=risky_high,
        importances=[float(v) for v in importancias],
        metrics={
            "auc": round(auc, 3),
            "samples": int(len(y)),
            "churned": positivos,
            "base_rate": round(positivos / len(y), 3),
            "validation": validacion,
            "usable": auc >= MIN_AUC,
        },
    )


def predict(model: ChurnModel, X: np.ndarray) -> np.ndarray:
    return model.estimator.predict_proba(np.asarray(X, dtype=float))[:, 1]


def _describe(key: str, value: float, median: float) -> str | None:
    v, m = round(value), round(median)
    if key == "days_since_last_visit":
        if value >= 180:
            return "nunca ha venido"
        normal = "quienes se quedan vienen casi a diario" if m <= 1 else f"quienes se quedan: {m} días"
        return f"{v} días sin venir ({normal})"
    if key == "visits_30":
        return f"{v} visitas este mes (quienes se quedan: {m})"
    if key == "visit_trend":
        return "viene cada vez menos" if value < 1 else None
    if key == "days_to_end":
        if value < 0:
            return f"membresía vencida hace {-v} días"
        return f"vence en {v} días" if value <= 10 else None
    if key == "membership_active":
        return "sin membresía vigente" if value < 0.5 else None
    if key == "renewals":
        return "nunca ha renovado" if value == 0 else None
    if key == "tenure_days":
        return f"lleva solo {v} días en el gimnasio" if value < 60 else None
    if key == "weekdays_60":
        return f"viene solo {v} día(s) distinto(s) de la semana" if value <= 1 else None
    if key == "visits_prev_30":
        return None
    if key == "paid_180":
        return None
    if key == "plan_days":
        return "plan corto, sin compromiso" if value <= 31 else None
    return None


def explain(model: ChurnModel, x: np.ndarray, top: int = 3) -> list[str]:
    """Las razones de ESTE socio: los rasgos que más pesan en el modelo y en
    los que él está del lado riesgoso respecto a quienes se quedan."""
    orden = np.argsort(model.importances)[::-1]
    razones: list[str] = []
    for j in orden:
        valor, mediana = float(x[j]), model.medians[j]
        riesgoso = valor > mediana if model.risky_high[j] else valor < mediana
        if not riesgoso:
            continue
        frase = _describe(FEATURE_KEYS[j], valor, mediana)
        if frase and frase not in razones:
            razones.append(frase)
        if len(razones) >= top:
            break
    return razones


def drivers(model: ChurnModel, top: int = 5) -> list[dict]:
    orden = np.argsort(model.importances)[::-1][:top]
    return [{"feature": FEATURES[j][1], "weight": round(model.importances[j], 3)} for j in orden]
