"""¿Renovará? Probabilidad de que un socio NO renueve, vista 3 semanas antes de vencer.

Reglas de honestidad:
- Una fila por membresía que terminó, con lo que se sabía en la fecha de corte
  (ver `data.renewal_dataset`): ningún rasgo puede contener la respuesta.
- Validación hacia adelante: se entrena con las membresías que terminaron antes y
  se mide con las más recientes, como se va a usar.
- Las probabilidades se calibran: "70 %" debe querer decir que de cada 10 así,
  7 no renuevan.
- Se compara contra la regla que la app ya usa. El modelo solo se usa si le gana
  con un margen que no se explique por azar (intervalo por bootstrap agrupado por
  socio); si no, la pantalla sigue con la regla y lo dice.
"""
from __future__ import annotations

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from app.services.ml.churn import FEATURES, ChurnModel, InsufficientData

MIN_SAMPLES = 120
MIN_PER_CLASS = 15
MIN_TEST = 40
MIN_AUC = 0.6
BOOTSTRAP = 300


def _base_estimator() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=150, learning_rate=0.06, max_leaf_nodes=12, min_samples_leaf=20,
        l2_regularization=1.0, random_state=0,
    )


def _fit_calibrated(X: np.ndarray, y: np.ndarray):
    method = "isotonic" if len(y) >= 1000 else "sigmoid"
    model = CalibratedClassifierCV(_base_estimator(), method=method, cv=3)
    model.fit(X, y)
    return model


def _auc(y, s) -> float | None:
    return float(roc_auc_score(y, s)) if len(set(y)) == 2 else None


def _cluster_bootstrap(y, p, r, groups, rng) -> dict:
    """Intervalo del 90 % remuestreando SOCIOS (sus membresías no son independientes)."""
    socios = np.unique(groups)
    por_socio = {g: np.flatnonzero(groups == g) for g in socios}
    aucs, difs = [], []
    for _ in range(BOOTSTRAP):
        idx = np.concatenate([por_socio[g] for g in rng.choice(socios, size=len(socios), replace=True)])
        yb = y[idx]
        if len(set(yb)) < 2:
            continue
        a_m = roc_auc_score(yb, p[idx])
        a_r = roc_auc_score(yb, r[idx])
        aucs.append(a_m)
        difs.append(a_m - a_r)
    if len(aucs) < BOOTSTRAP // 2:
        return {"auc_ci": None, "gain_ci": None}
    return {
        "auc_ci": [round(float(np.percentile(aucs, 5)), 3), round(float(np.percentile(aucs, 95)), 3)],
        "gain_ci": [round(float(np.percentile(difs, 5)), 3), round(float(np.percentile(difs, 95)), 3)],
    }


def _calibration(y, p, bins: int = 5) -> list[dict]:
    """Por tramos de probabilidad: cuánto dijo el modelo y cuánto pasó de verdad."""
    out = []
    edges = np.quantile(p, np.linspace(0, 1, bins + 1))
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        m = (p >= lo) & (p <= hi) if i == bins - 1 else (p >= lo) & (p < hi)
        if m.sum() == 0:
            continue
        out.append({"predicted": round(float(p[m].mean()), 3), "observed": round(float(y[m].mean()), 3), "n": int(m.sum())})
    return out


def train(X, y, ends, groups, rule) -> ChurnModel:
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=int)
    ends = np.asarray(ends)
    groups = np.asarray([str(g) for g in groups])
    rule = np.asarray(rule, dtype=float)
    pos = int(y.sum())
    if len(y) < MIN_SAMPLES or pos < MIN_PER_CLASS or len(y) - pos < MIN_PER_CLASS:
        raise InsufficientData(
            f"hacen falta {MIN_SAMPLES} membresías terminadas con al menos {MIN_PER_CLASS} renovaciones y "
            f"{MIN_PER_CLASS} no renovaciones (hay {len(y)}, {pos} sin renovar)"
        )

    # Hacia adelante: el último 25 % de las membresías (por fecha de fin) es la prueba.
    corte = np.sort(ends)[int(len(ends) * 0.75)]
    test = ends >= corte
    train_mask = ~test
    if test.sum() < MIN_TEST or len(set(y[test])) < 2 or len(set(y[train_mask])) < 2:
        raise InsufficientData("todavía no hay suficientes membresías recientes para probar el modelo hacia adelante")

    model = _fit_calibrated(X[train_mask], y[train_mask])
    p = model.predict_proba(X[test])[:, 1]
    yt, rt = y[test], rule[test]
    auc = _auc(yt, p)
    auc_rule = _auc(yt, rt)
    ci = _cluster_bootstrap(yt, p, rt, groups[test], np.random.default_rng(0))
    base_rate = float(y[train_mask].mean())
    brier = float(brier_score_loss(yt, p))
    brier_ref = float(brier_score_loss(yt, np.full(len(yt), base_rate)))

    usable = bool(
        auc is not None and auc >= MIN_AUC and ci["gain_ci"] is not None and ci["gain_ci"][0] > 0
        and brier < brier_ref
    )

    imp = permutation_importance(model, X[test], yt, scoring="roc_auc", n_repeats=3, random_state=0)
    pesos = np.clip(imp.importances_mean, 0, None)
    pesos = pesos / pesos.sum() if pesos.sum() > 0 else np.ones(X.shape[1]) / X.shape[1]
    risky_high = [bool(X[y == 1, j].mean() > X[y == 0, j].mean()) for j in range(X.shape[1])]

    final = _fit_calibrated(X, y)
    return ChurnModel(
        estimator=final,
        medians=[float(v) for v in np.median(X[y == 0], axis=0)],
        risky_high=risky_high,
        importances=[float(v) for v in pesos],
        metrics={
            "target": "no_renueva",
            "auc": round(auc, 3) if auc is not None else None,
            "auc_ci": ci["auc_ci"],
            "rule_auc": round(auc_rule, 3) if auc_rule is not None else None,
            "gain_vs_rule_ci": ci["gain_ci"],
            "pr_auc": round(float(average_precision_score(yt, p)), 3),
            "brier": round(brier, 4),
            "brier_reference": round(brier_ref, 4),
            "calibration": _calibration(yt, p),
            "samples": int(len(y)),
            "test_samples": int(test.sum()),
            "churned": pos,
            "base_rate": round(float(y.mean()), 3),
            "validation": "hacia adelante (último 25 % de membresías terminadas)",
            "usable": usable,
        },
    )


def _es(v) -> str:
    return f"{v:.2f}".replace(".", ",") if isinstance(v, (int, float)) else str(v)


def verdict(metrics: dict) -> str:
    """Una frase para la pantalla: por qué se usa o no el modelo."""
    auc, rule = _es(metrics.get("auc")), _es(metrics.get("rule_auc"))
    gain = [_es(g) for g in metrics["gain_vs_rule_ci"]] if metrics.get("gain_vs_rule_ci") else None
    if metrics.get("usable"):
        return (f"Se usa el modelo: ordena mejor que la regla actual ({auc} contra {rule}) en las membresías "
                f"más recientes, con margen entre {gain[0]} y {gain[1]}.")
    if metrics.get("auc") is None:
        return "No hubo con qué probar el modelo: se usa la regla."
    if metrics.get("gain_vs_rule_ci") and metrics["gain_vs_rule_ci"][0] <= 0:
        return (f"Se usa la regla: el modelo ({auc}) no le gana de forma clara a la regla actual ({rule}) "
                "en las membresías más recientes.")
    return f"Se usa la regla: el modelo acierta poco todavía ({auc})."


__all__ = ["train", "verdict", "FEATURES", "InsufficientData"]
