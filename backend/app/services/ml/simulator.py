"""Historia sintética de un gimnasio para evaluar los modelos sin datos reales.

No se siembra la respuesta en ningún rasgo: cada socio tiene un compromiso
latente que cambia semana a semana (con tropiezos de la vida real), sus visitas
salen de ese compromiso con azar, y la decisión de renovar depende del
compromiso más ruido. El modelo solo puede aprender lo que se ve en el
comportamiento, igual que con un gimnasio de verdad.

`random_labels=True` hace que renovar sea pura suerte: sirve para comprobar que
el modelo NO encuentra señal donde no la hay (si la encontrara, hay una fuga).
"""
from __future__ import annotations

import math
import random
import uuid
from datetime import date, datetime, timedelta

from app.services.ml.data import History, MemberInfo, Stint

PLANS = [("Mensual", 30, 90000.0), ("Trimestral", 90, 240000.0)]


def _sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def simulate(today: date, members: int = 500, days: int = 300, seed: int = 7,
             random_labels: bool = False) -> History:
    rng = random.Random(seed)
    start = today - timedelta(days=days)
    h = History(today=today, start=start)

    for i in range(members):
        mid = uuid.UUID(int=rng.getrandbits(128))
        joined = start + timedelta(days=int(rng.random() * (days - 20)))
        h.members[mid] = MemberInfo(joined, True, f"Socio {i}", None)
        engagement = rng.betavariate(2.2, 2.0)
        renewals = 0
        plan = PLANS[0] if rng.random() < 0.75 else PLANS[1]
        s_start = joined
        weekly_e: dict[int, float] = {}
        alive = True
        while alive and s_start <= today:
            s_end = s_start + timedelta(days=plan[1] - 1)
            stint = Stint(s_start, s_end, plan[1], plan[2], plan[0], created=s_start)
            # 5 % se registran tarde, con fecha de inicio hacia atrás.
            if rng.random() < 0.05:
                stint.created = s_start + timedelta(days=rng.randint(3, 15))
            h.stints.setdefault(mid, []).append(stint)
            h.paid.setdefault(mid, []).append((stint.created or s_start, plan[2]))

            d = s_start
            while d <= min(s_end, today - timedelta(days=1)):
                week = (d - start).days // 7
                if week not in weekly_e:
                    shock = -rng.uniform(0.2, 0.5) if rng.random() < 0.025 else 0.0
                    engagement = min(max(engagement + rng.gauss(0, 0.06) + shock, 0.02), 0.98)
                    weekly_e[week] = engagement
                if rng.random() < weekly_e[week] * 0.75:
                    hour = rng.choice([6, 7, 8, 12, 17, 18, 19, 20])
                    h.visits.setdefault(mid, []).append(d)
                    h.hours.setdefault(mid, []).append((d, hour))
                    h.visit_times.append(datetime(d.year, d.month, d.day, hour, rng.randint(0, 59)))
                    h.daily_checkins[d] = h.daily_checkins.get(d, 0) + 1
                d += timedelta(days=1)

            if s_end >= today:
                break
            recent = [weekly_e[w] for w in sorted(weekly_e)[-3:]] or [engagement]
            if random_labels:
                p = 0.62
            else:
                p = _sigmoid(-0.4 + 5.0 * (sum(recent) / len(recent) - 0.5) + 0.35 * min(renewals, 3) + rng.gauss(0, 0.9))
            if rng.random() < p:
                renewals += 1
                gap = 0 if rng.random() < 0.8 else rng.randint(1, 25)
                s_start = s_end + timedelta(days=1 + gap)
                if rng.random() < 0.1:
                    plan = PLANS[1] if plan is PLANS[0] else PLANS[0]
            else:
                alive = False
                h.members[mid].active = False

    for mid, pagos in h.paid.items():
        for d, monto in pagos:
            if start <= d < today:
                h.daily_revenue[d] = h.daily_revenue.get(d, 0.0) + monto
    return h.finalize()
