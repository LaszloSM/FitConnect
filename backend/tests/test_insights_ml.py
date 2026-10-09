"""La inteligencia entrena con el historial de un gimnasio y cae a reglas sin él."""
import random
import uuid
from datetime import date, datetime, timedelta

from app.services.ml import data, registry


def _synthetic_history(n_members: int = 320, seed: int = 7) -> data.History:
    """Un gimnasio con 10 meses de vida y tres tipos de socio con destinos distintos."""
    rng = random.Random(seed)
    hoy = date(2026, 9, 12)
    h = data.History(today=hoy, start=hoy - timedelta(days=300))
    for i in range(n_members):
        mid = uuid.UUID(int=i + 1)
        tipo = rng.choices(["fiel", "ocasional", "se_va"], weights=[0.4, 0.35, 0.25])[0]
        creado = hoy - timedelta(days=rng.randint(60, 290))
        dia = creado
        renueva = {"fiel": 0.92, "ocasional": 0.65, "se_va": 0.25}[tipo]
        por_semana = {"fiel": 4.0, "ocasional": 1.5, "se_va": 2.5}[tipo]
        hora = {"fiel": 6, "ocasional": 12, "se_va": 19}[tipo]
        tramos = []
        while dia < hoy:
            precio = 80000 if dia < hoy - timedelta(days=150) else 95000
            fin = dia + timedelta(days=29)
            tramos.append(data.Stint(dia, fin, 30, float(precio), "Mensual"))
            h.paid.setdefault(mid, []).append((dia, float(precio)))
            h.daily_revenue[dia] = h.daily_revenue.get(dia, 0.0) + precio
            ultimo = rng.random() > renueva
            d = dia
            while d <= min(fin, hoy - timedelta(days=1)):
                # Quien se va deja de venir las últimas dos semanas antes de irse.
                apagado = ultimo and (fin - d).days < 14
                if not apagado and rng.random() < por_semana / 7:
                    h.visits.setdefault(mid, []).append(d)
                    h.hours.setdefault(mid, []).append((d, hora))
                    h.visit_times.append(datetime(d.year, d.month, d.day, hora, 10))
                    h.daily_checkins[d] = h.daily_checkins.get(d, 0) + 1
                d += timedelta(days=1)
            if ultimo:
                break
            dia = fin + timedelta(days=1)
        activo = bool(tramos) and tramos[-1].end >= hoy
        h.members[mid] = data.MemberInfo(creado, activo, f"Socio {i}", "3001234567")
        h.stints[mid] = tramos
    return h.finalize()


def test_every_model_trains_on_a_gym_with_history():
    resultados = registry.train_from_history(_synthetic_history())
    estados = {k: v["status"] for k, v in resultados.items()}
    # Con 4 ventanas hacia atrás el pronóstico solo se usa si le gana al ritmo en
    # promedio; si no, queda "weak" y la pantalla sigue con el ritmo, y lo dice.
    assert estados["forecast"] in ("trained", "weak")
    assert resultados["forecast"]["metrics"]["backtest"]["windows"] >= 2
    assert estados["segments"] == "trained"
    assert estados["occupancy"] == "trained"
    assert estados["pricing"] == "trained"
    assert estados["anomalies"] == "trained"
    grupos = resultados["segments"]["result"]["groups"]
    assert sum(len(g["member_ids"]) for g in grupos) == sum(g["size"] for g in grupos)


def test_churn_features_are_seen_at_the_cutoff_not_today():
    h = _synthetic_history(60)
    mid = next(iter(h.members))
    corte = h.today - timedelta(days=120)
    fila = data.features_at(h, mid, corte)
    # Ninguna visita posterior al corte puede colarse en "días sin venir".
    visitas_previas = [d for d in h.visits.get(mid, []) if d <= corte]
    esperado = min((corte - visitas_previas[-1]).days, data.NEVER) if visitas_previas else data.NEVER
    assert fila[0] == esperado


def test_a_new_gym_gets_insufficient_data_everywhere():
    h = data.History(today=date(2026, 9, 12), start=date(2025, 11, 16)).finalize()
    resultados = registry.train_from_history(h)
    assert {v["status"] for v in resultados.values()} == {"insufficient_data"}
    assert all(v.get("detail") for v in resultados.values())


async def test_insights_degrade_to_rules_on_an_empty_gym(client):
    email = f"ml-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!", "full_name": "Owner ML", "gym_name": "Gym ML", "city": "Bogotá",
    })
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    antes = await client.get("/api/v1/insights/models", headers=headers)
    assert antes.status_code == 200
    assert {m["status"] for m in antes.json()} == {"never_trained"}

    entreno = await client.post("/api/v1/insights/models/train", headers=headers)
    assert entreno.status_code == 200, entreno.text
    assert set(entreno.json()["status"].values()) == {"insufficient_data"}

    for path in ("segments", "anomalies", "occupancy", "pricing"):
        r = await client.get(f"/api/v1/insights/{path}", headers=headers)
        assert r.status_code == 200, (path, r.text)
        assert r.json()["status"] == "insufficient_data"

    fc = await client.get("/api/v1/insights/forecast", headers=headers)
    assert fc.json()["method"] == "reglas"
    drivers = await client.get("/api/v1/insights/churn-drivers", headers=headers)
    assert drivers.json()["method"] == "reglas"
    assert (await client.get("/api/v1/insights/churn-risk", headers=headers)).status_code == 200


# ─── ¿Renovará? ──────────────────────────────────────────────────────────────

from app.services.ml import renewal  # noqa: E402
from app.services.ml.simulator import simulate  # noqa: E402


def test_renewal_model_learns_behaviour_and_reports_honest_metrics():
    h = simulate(date(2026, 10, 8), members=600, seed=2)
    r = registry.train_from_history(h)["churn"]
    assert r["status"] in ("trained", "weak"), r.get("detail")
    m = r["metrics"]
    assert m["auc"] >= 0.65 and m["test_samples"] >= 40
    assert m["rule_auc"] is not None and m["gain_vs_rule_ci"] and m["auc_ci"]
    assert m["brier"] < m["brier_reference"]
    assert r["detail"]
    # Si dice que se usa, es porque le ganó a la regla con margen.
    if r["status"] == "trained":
        assert m["gain_vs_rule_ci"][0] > 0


def test_renewal_model_finds_nothing_when_renewing_is_pure_luck():
    """Si el modelo encuentra señal donde no la hay, algún rasgo trae la respuesta (fuga)."""
    h = simulate(date(2026, 10, 8), members=600, seed=1, random_labels=True)
    m = renewal.train(*data.renewal_dataset(h))
    assert m.metrics["usable"] is False
    assert m.metrics["auc"] < 0.62


def test_a_renewal_registered_late_is_not_seen_before_it_was_registered():
    hoy = date(2026, 10, 8)
    h = data.History(today=hoy, start=hoy - timedelta(days=300))
    mid = uuid.uuid4()
    h.members[mid] = data.MemberInfo(hoy - timedelta(days=200), True, "Ana", None)
    primera = data.Stint(hoy - timedelta(days=100), hoy - timedelta(days=71), 30, 90000, "Mensual", hoy - timedelta(days=100))
    # Renovación que empieza al día siguiente pero se registró 20 días después.
    tarde = data.Stint(hoy - timedelta(days=70), hoy - timedelta(days=41), 30, 90000, "Mensual", hoy - timedelta(days=50))
    h.stints[mid] = [primera, tarde]
    h.finalize()
    corte = hoy - timedelta(days=60)
    fila = data.features_at(h, mid, corte)
    assert fila[5] == 0, "no puede contar una renovación que en el corte nadie había registrado"
    assert fila[7] == 0.0, "en el corte no había membresía vigente registrada"
