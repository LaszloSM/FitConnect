"""Los modelos aprenden patrones reales y caen con elegancia sin datos.

Datos sintéticos con una señal conocida: si el modelo no la encuentra, no sirve
para un gimnasio de verdad.
"""
from datetime import date, datetime, timedelta

import numpy as np
import pytest

from app.services.ml import anomalies, churn, forecast, inventory, occupancy, pricing, segments


def _churn_data(n=600, seed=0):
    rng = np.random.default_rng(seed)
    dias_sin = rng.integers(0, 60, n)
    visitas = np.clip(12 - dias_sin / 5 + rng.normal(0, 2, n), 0, None)
    activa = (rng.random(n) > 0.2).astype(float)
    X = np.column_stack([
        dias_sin, visitas, visitas + rng.normal(0, 1, n), (visitas + 1) / (visitas + 2),
        rng.integers(10, 900, n), rng.integers(0, 6, n), rng.integers(-30, 60, n), activa,
        rng.integers(0, 7, n), rng.choice([30, 90, 365], n), rng.integers(0, 900, n),
    ])
    logit = 0.08 * dias_sin - 0.25 * visitas - 1.5 * activa
    y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)
    snap = rng.integers(0, 5, n)
    return X, y, snap


def test_churn_model_learns_the_signal_and_explains_it():
    X, y, snap = _churn_data()
    model = churn.train(X, y, snap)
    assert model.metrics["auc"] > 0.75
    assert model.metrics["usable"] is True
    # Los días sin venir son la señal plantada: tienen que estar entre los rasgos que más pesan.
    top = [d["feature"] for d in churn.drivers(model, 3)]
    assert "días sin venir" in top or "visitas en los últimos 30 días" in top

    riesgoso = np.array([55, 0, 3, 0.3, 400, 0, -10, 0, 1, 30, 0], dtype=float)
    tranquilo = np.array([1, 14, 13, 1.0, 400, 3, 40, 1, 5, 365, 600], dtype=float)
    p = churn.predict(model, np.vstack([riesgoso, tranquilo]))
    assert p[0] > p[1]
    razones = churn.explain(model, riesgoso)
    assert razones and all(isinstance(r, str) for r in razones)


def test_churn_refuses_to_train_without_enough_history():
    X, y, snap = _churn_data(n=40)
    with pytest.raises(churn.InsufficientData):
        churn.train(X, y, snap)


def test_holt_winters_learns_the_weekly_pattern():
    semana = np.array([900, 700, 700, 800, 1000, 1500, 300], dtype=float)
    serie = np.tile(semana, 12) * np.linspace(1, 1.1, 84)
    modelo = forecast.fit(serie)
    siguiente = modelo.forecast(7)
    # El sábado sigue siendo el día más fuerte y el domingo el más flojo.
    dias = [(84 + i) % 7 for i in range(7)]
    assert dias[int(np.argmax(siguiente))] == 5
    assert dias[int(np.argmin(siguiente))] == 6
    bt = forecast.backtest(serie)
    assert bt["model_error_pct"] <= bt["pace_error_pct"] + 1
    mes = forecast.project_month(modelo, 10_000, 10)
    assert mes["projection_low"] <= mes["projection"] <= mes["projection_high"]


def test_holt_winters_needs_eight_weeks():
    with pytest.raises(ValueError):
        forecast.fit([100.0] * 20)


def test_segments_name_the_obvious_groups():
    rng = np.random.default_rng(1)
    fieles = np.column_stack([rng.integers(0, 3, 30), rng.integers(30, 45, 30), rng.integers(500, 700, 30), rng.integers(400, 900, 30), rng.normal(7, 0.5, 30)])
    lejos = np.column_stack([rng.integers(40, 90, 30), rng.integers(0, 3, 30), rng.integers(0, 100, 30), rng.integers(200, 600, 30), rng.normal(13, 1, 30)])
    nuevos = np.column_stack([rng.integers(0, 5, 30), rng.integers(5, 12, 30), rng.integers(80, 150, 30), rng.integers(1, 25, 30), rng.normal(19, 0.5, 30)])
    labels, grupos = segments.segment(np.vstack([fieles, lejos, nuevos]))
    nombres = {g["name"] for g in grupos}
    assert {"Fieles", "Alejándose", "Recién llegados"} <= nombres
    assert sum(g["size"] for g in grupos) == 90
    assert len(labels) == 90


def test_anomalies_flag_a_dead_day():
    inicio = date(2026, 6, 1)
    dias = [inicio + timedelta(days=i) for i in range(90)]
    rng = np.random.default_rng(2)
    ingresos = [1000 + rng.normal(0, 60) for _ in dias]
    entradas = [40 + int(rng.normal(0, 3)) for _ in dias]
    ingresos[80], entradas[80] = 0.0, 0
    res = anomalies.detect(dias, ingresos, entradas)
    assert any(a["date"] == dias[80].isoformat() for a in res)


def test_occupancy_forecasts_the_busy_slot():
    hoy = date(2026, 9, 12)
    visitas = []
    for i in range(1, 50):
        d = hoy - timedelta(days=i)
        n = 20 if d.weekday() == 0 else 3
        visitas += [datetime(d.year, d.month, d.day, 18, 5)] * n
    grid, dias = occupancy.expected_grid(visitas, hoy)
    semana = occupancy.next_week(grid, hoy)
    assert semana["top"][0]["weekday_label"] == "Lun"
    assert semana["top"][0]["hour"] == 18


def test_pricing_reads_elasticity_only_with_two_prices():
    filas = [{"plan_name": "Mensual", "price": 80000, "renewed": i % 10 < 8} for i in range(20)]
    filas += [{"plan_name": "Mensual", "price": 100000, "renewed": i % 10 < 6} for i in range(20)]
    filas += [{"plan_name": "Anual", "price": 700000, "renewed": True} for _ in range(12)]
    res = {r["plan_name"]: r for r in pricing.plan_elasticity(filas)}
    assert res["Mensual"]["elasticity"] < 0
    assert res["Anual"]["elasticity"] is None


def test_inventory_uses_the_weekly_pattern():
    hoy = date(2026, 9, 12)
    dias = [hoy - timedelta(days=60 - i) for i in range(60)]
    unidades = [10.0 if d.weekday() == 5 else 2.0 for d in dias]
    perfil = inventory.weekday_profile(dias, unidades)
    assert perfil[5] > 2.5
    v = inventory.smoothed_velocity(unidades)
    assert inventory.run_out(40, v, perfil, hoy) is not None
    assert inventory.run_out(40, 0, perfil, hoy) is None
