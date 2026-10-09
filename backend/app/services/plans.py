"""Planes de comidas y de entreno: forma de los datos, validación y contexto
de la persona. Los usan el generador con IA y el automático.

Nada de lo que llega de un modelo (o del celular) se guarda sin pasar por
aquí: los alimentos tienen que existir en la base y sus calorías y macros los
calcula el servidor, no quien propone el plan.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutil import today_bogota
from app.models.app import AppProfile, Food, SavedPlan
from app.services import nutrition
from app.services.foods import scaled

MIN_AGE = 18

KNOWLEDGE = """
BASE DE CONOCIMIENTO (resúmenes propios)

[ACT-OMS] OMS 2020: adultos 150 a 300 min/semana de actividad aeróbica moderada (o 75 a 150 vigorosa) y
fortalecimiento muscular 2 o más días por semana.
[RT-ACSM] ACSM 2009: principiantes 8 a 12 repeticiones, 1 a 3 series, 2 a 3 días por semana por grupo muscular;
progresar la carga cuando se superan las repeticiones objetivo. Descansos de 1 a 2 min en accesorios y de 2 a 3
min en multiarticulares pesados.
[VOL-SCHOENFELD] Más series semanales por músculo se asocian con más hipertrofia; 10 o más series semanales
por músculo dieron más crecimiento que menos de 5. Empezar con menos y subir según recuperación.
[REPS-SCHOENFELD] La hipertrofia es similar entre aprox. 6 y 30 repeticiones si las series se llevan cerca del
fallo; las cargas altas favorecen más la fuerza máxima.
[FREQ-SCHOENFELD] Con el volumen igualado, entrenar un músculo 1 o 2+ veces por semana da resultados parecidos.
[PROT-ISSN] 1,4 a 2,0 g de proteína por kg al día, repartida en tomas de 20 a 40 g. En déficit, valores altos
ayudan a conservar músculo.
[ENERGY] Para bajar grasa, déficit moderado (~10-25 %), perder ~0,5-1 % del peso por semana; para ganar músculo,
superávit pequeño (~5-15 %). Nunca bajar del gasto en reposo.
[FIBRA] Unos 14 g de fibra por cada 1.000 kcal: verduras, frutas, leguminosas y cereales integrales.
"""


class PlanError(ValueError):
    pass


def _s(v: Any, n: int) -> str:
    return str(v or "").strip()[:n]


def validate_training(data: dict) -> dict:
    days = data.get("days") or []
    if not 1 <= len(days) <= 7:
        raise PlanError("El plan necesita entre 1 y 7 días.")
    seen: set[int] = set()
    out_days = []
    for d in days:
        wd = d.get("weekday")
        if not isinstance(wd, int) or not 0 <= wd <= 6 or wd in seen:
            raise PlanError("Cada día necesita un weekday distinto entre 0 (lunes) y 6 (domingo).")
        seen.add(wd)
        exs = d.get("exercises") or []
        if not 1 <= len(exs) <= 12:
            raise PlanError("Cada día debe tener entre 1 y 12 ejercicios.")
        out_ex = []
        for e in exs:
            sets = e.get("sets")
            if not isinstance(sets, int) or not 1 <= sets <= 10:
                raise PlanError(f"Las series de «{_s(e.get('name'), 60)}» deben estar entre 1 y 10.")
            rest = e.get("rest_seconds")
            out_ex.append({"name": _s(e.get("name"), 120) or "Ejercicio", "sets": sets, "reps": _s(e.get("reps"), 20) or "10",
                           "rest_seconds": int(rest) if isinstance(rest, (int, float)) and 0 <= rest <= 600 else 90,
                           "notes": _s(e.get("notes"), 200) or None})
        out_days.append({"weekday": wd, "title": _s(d.get("title"), 80) or "Entreno", "exercises": out_ex})
    return {"notes": _s(data.get("notes"), 600) or None, "days": sorted(out_days, key=lambda x: x["weekday"])}


async def foods_by_ids(adb: AsyncSession, user_id, ids) -> dict:
    from app.services.foods import visible
    ids = [i for i in ids if i]
    if not ids:
        return {}
    rows = (await adb.execute(select(Food).where(Food.id.in_(ids), visible(user_id)))).scalars().all()
    return {str(f.id): f for f in rows}


def validate_meals(data: dict, min_kcal: Optional[int], foods: dict[str, Food]) -> dict:
    """`foods`: los alimentos permitidos por id. Las cifras se recalculan."""
    meals = data.get("meals") or []
    if not 2 <= len(meals) <= 8:
        raise PlanError("El plan de comidas necesita entre 2 y 8 comidas.")
    out = []
    for m in meals:
        t = _s(m.get("time"), 5)
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t):
            raise PlanError("Cada comida necesita una hora HH:MM en formato 24 h.")
        items = m.get("items") or []
        if not 1 <= len(items) <= 10:
            raise PlanError("Cada comida necesita entre 1 y 10 alimentos.")
        out_items = []
        for it in items:
            food = foods.get(str(it.get("food_id")))
            if food is None:
                raise PlanError("Un alimento del plan no está en la base de alimentos.")
            grams = it.get("grams")
            if not isinstance(grams, (int, float)) or not 1 <= grams <= 1500:
                raise PlanError(f"Los gramos de «{food.name}» deben estar entre 1 y 1.500.")
            v = scaled(float(grams), food)
            out_items.append({"food_id": str(food.id), "food": food.name, "grams": round(float(grams)),
                              "portion": _s(it.get("portion"), 60) or None,
                              **{k: v[k] for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}})
        tot = {k: round(sum(i[k] for i in out_items), 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}
        out.append({"time": t, "name": _s(m.get("name"), 40) or "Comida", "items": out_items, **tot})
    totals = {k: round(sum(m[k] for m in out), 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}
    floor = min_kcal or 1200
    if totals["kcal"] < floor:
        raise PlanError(f"El plan suma {round(totals['kcal'])} kcal y el mínimo seguro para esta persona es {floor} kcal.")
    return {"notes": _s(data.get("notes"), 600) or None, "meals": sorted(out, key=lambda x: x["time"]),
            "totals": totals, "targets": data.get("targets")}


@dataclass
class Person:
    age: Optional[int]
    sex: Optional[str]
    goal: Optional[str]
    pace: Optional[str]
    activity: Optional[str]
    weight_kg: Optional[float]
    height_cm: Optional[int]
    targets: Optional[dict]
    min_kcal: int
    parq_flag: bool

    def anonymous(self) -> dict:
        """Lo único que sale hacia un proveedor externo: sin nombre, correo,
        documento ni gimnasio, con la edad en rango y el peso redondeado."""
        age = None if self.age is None else f"{self.age // 10 * 10}-{self.age // 10 * 10 + 9}"
        return {
            "edad": age, "sexo": self.sex, "objetivo": self.goal, "ritmo": self.pace, "actividad": self.activity,
            "peso_kg_aprox": None if self.weight_kg is None else int(round(self.weight_kg / 5) * 5),
            "talla_cm_aprox": None if self.height_cm is None else int(round(self.height_cm / 5) * 5),
            "metas": {k: self.targets[k] for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")} if self.targets else None,
            "minimo_kcal": self.min_kcal, "parq_con_alertas": self.parq_flag,
        }


async def person(user, master: AsyncSession, adb: AsyncSession) -> Person:
    from app.models.tenant.member import Member
    from app.services import app_accounts
    from app.services.device_directory import tenant_session

    consents = await app_accounts.consents(master, user.id)
    p = await adb.get(AppProfile, user.id)
    age = nutrition.age_on(p.birth_date, today_bogota()) if p and p.birth_date else None
    health = consents["health"]
    weight = float(p.weight_kg) if p and p.weight_kg and health else None
    height = p.height_cm if p and health else None
    targets = None
    min_kcal = nutrition.CALORIE_FLOOR.get(p.sex if p and p.sex else "other", 1350)
    if p and health:
        try:
            t = nutrition.compute(sex=p.sex, weight_kg=weight, height_cm=height, birth_date=p.birth_date,
                                  activity=p.activity_level, goal=p.goal, today=today_bogota(), pace=p.pace)
            targets = t.as_dict()
            min_kcal = max(min_kcal, t.bmr)
        except ValueError:
            pass
    parq = False
    if health:
        for link, _tenant in await app_accounts.active_links(master, user.id):
            try:
                async with tenant_session(link.db_name) as db:
                    m = await db.get(Member, link.member_id)
                if m and m.parq_answers:
                    parq = parq or any(bool(v) for v in m.parq_answers.values())
            except Exception:  # noqa: BLE001 — un gimnasio caído no impide generar el plan
                pass
    return Person(age=age, sex=p.sex if p else None, goal=p.goal if p else None, pace=p.pace if p else None,
                  activity=p.activity_level if p else None, weight_kg=weight, height_cm=height, targets=targets,
                  min_kcal=int(min_kcal), parq_flag=parq)


def plan_out(p: SavedPlan) -> dict:
    return {"id": str(p.id), "kind": p.kind, "title": p.title, "data": p.data, "active": p.active,
            "created_at": p.created_at.isoformat() if p.created_at else None}
