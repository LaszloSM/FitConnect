"""Planes automáticos, sin IA. Salen siempre: cuando no hay llave del
proveedor, cuando se acabó la cuota o cuando el modelo falla.

- Comidas: plantillas por tiempo de comida con alimentos comunes en Colombia.
  La proteína de cada comida se ajusta a su parte de la meta y los
  carbohidratos completan las calorías; después se escala el día para quedar
  a ±5 % de la meta.
- Entreno: divisiones clásicas según los días disponibles (cuerpo completo,
  torso/pierna, empuje/tirón/pierna), con series y repeticiones según el
  nivel y el foco [RT-ACSM], [REPS-SCHOENFELD].
"""
from __future__ import annotations

import hashlib
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app import Food

# ─── Comidas ───

SLOTS = {
    3: [("07:00", "Desayuno", "breakfast", 0.30), ("13:00", "Almuerzo", "lunch", 0.40), ("19:30", "Cena", "dinner", 0.30)],
    4: [("07:00", "Desayuno", "breakfast", 0.25), ("13:00", "Almuerzo", "lunch", 0.35),
        ("16:30", "Algo", "snack", 0.15), ("19:30", "Cena", "dinner", 0.25)],
    5: [("07:00", "Desayuno", "breakfast", 0.22), ("10:00", "Media mañana", "snack", 0.10),
        ("13:00", "Almuerzo", "lunch", 0.33), ("16:30", "Algo", "snack", 0.10), ("19:30", "Cena", "dinner", 0.25)],
}

#: Opciones por rol y tiempo de comida, en orden de preferencia. El plan
#: rota entre ellas según la fecha para que no salga igual todos los días.
OPTIONS = {
    "breakfast": {
        "carb": ["tcac_5", "pan_integral_usda", "avena_usda", "tcac_9"],
        "protein": ["huevo_entero", "yogur_griego", "queso_mozzarella_semi", "tofu_firme"],
        "fruit": ["papaya", "banano_usda", "pina", "mango_usda", "fresa_usda"],
    },
    "lunch": {
        "carb": ["tcac_10", "papa_cocida_usda", "tcac_247", "pasta_cocida", "quinua_cocida", "arroz_integral_cocido"],
        "protein": ["pechuga_pollo_asada", "lomo_res_asado", "tilapia_cocida", "lomo_cerdo_asado", "lentejas_cocidas",
                    "frijol_rojo_cocido", "muslo_pollo_asado"],
        "veg": ["ensalada", "brocoli_cocido", "habichuela_cocida", "ahuyama_asada"],
        "fat": ["aguacate_usda", "aceite_oliva_usda"],
    },
    "dinner": {
        "carb": ["tcac_5", "papa_cocida_usda", "batata_asada", "tcac_10", "tortilla_maiz"],
        "protein": ["tilapia_cocida", "pechuga_pollo_asada", "huevo_entero", "atun_agua_usda", "lomo_cerdo_asado",
                    "garbanzos_cocidos"],
        "veg": ["ensalada", "calabacin", "brocoli_cocido", "champinones"],
        "fat": ["aceite_oliva_usda", "aguacate_usda"],
    },
    "snack": {
        "protein": ["yogur_griego", "mani_tostado_usda", "queso_cottage", "almendras"],
        "fruit": ["banano_usda", "manzana", "mandarina", "pera"],
    },
}
VEG_MIX = ["lechuga", "tomate_usda", "pepino"]
RESTRICTED = {
    "vegetarian": {"pechuga_pollo_asada", "lomo_res_asado", "tilapia_cocida", "lomo_cerdo_asado", "muslo_pollo_asado",
                   "atun_agua_usda"},
    "no_dairy": {"yogur_griego", "queso_mozzarella_semi", "queso_cottage"},
    "no_pork": {"lomo_cerdo_asado"},
    "no_fish": {"tilapia_cocida", "atun_agua_usda"},
}
RESTRICTION_LABELS = {"vegetarian": "Vegetariano (sin carnes ni pescado)", "no_dairy": "Sin lácteos",
                      "no_pork": "Sin cerdo", "no_fish": "Sin pescado ni mariscos"}


def _seed(user_id, day: date, salt: str) -> int:
    return int(hashlib.sha256(f"{user_id}|{day.isoformat()}|{salt}".encode()).hexdigest()[:8], 16)


async def _foods(adb: AsyncSession) -> dict[str, Food]:
    keys = {k for meal in OPTIONS.values() for opts in meal.values() for k in opts} | set(VEG_MIX)
    rows = (await adb.execute(select(Food).where(Food.ref_key.in_(keys), Food.owner_id.is_(None)))).scalars().all()
    return {f.ref_key: f for f in rows}


def _pick(options: list[str], banned: set[str], have: dict[str, Food], seed: int) -> Optional[str]:
    ok = [k for k in options if k not in banned and (k in have or k == "ensalada")]
    return ok[seed % len(ok)] if ok else None


def _round5(g: float) -> int:
    return max(5, int(round(g / 5) * 5))


def _portion_label(food: Food, grams: float) -> Optional[str]:
    for p in food.portions or []:
        if p.get("label") != "100 g" and abs(float(p["grams"]) - grams) <= max(5, 0.1 * grams):
            return p["label"]
    return None


async def meal_plan(adb: AsyncSession, user_id, targets: dict, meals_per_day: int,
                    restrictions: list[str], day: date) -> dict:
    """Plan del día como el que validaría `plans.validate_meals` (con ids)."""
    have = await _foods(adb)
    banned = set().union(*(RESTRICTED.get(r, set()) for r in restrictions)) if restrictions else set()
    kcal_goal = float(targets["kcal"])
    prot_goal = float(targets["protein_g"])
    meals = []
    for i, (time, name, kind, share) in enumerate(SLOTS.get(meals_per_day, SLOTS[3])):
        opts = OPTIONS[kind]
        seed = _seed(user_id, day, f"{i}")
        items: list[tuple[Food, float]] = []
        slot_kcal = kcal_goal * share
        prot_key = _pick(opts.get("protein", []), banned, have, seed)
        if prot_key:
            f = have[prot_key]
            per_g = float(f.protein_g) / 100
            grams = min(250.0, prot_goal * share / per_g) if per_g > 0.02 else 150.0
            if prot_key in ("mani_tostado_usda", "almendras"):
                grams = 30.0
            items.append((f, grams))
        for role, grams in (("veg", 120.0), ("fruit", 150.0), ("fat", 0.0)):
            key = _pick(opts.get(role, []), banned, have, seed // 7)
            if not key:
                continue
            if key == "ensalada":
                items += [(have[k], 40.0) for k in VEG_MIX if k in have]
                continue
            f = have[key]
            if role == "fat":
                grams = 50.0 if key == "aguacate_usda" else 7.0
            items.append((f, grams))
        carb_key = _pick(opts.get("carb", []), banned, have, seed // 13)
        used = sum(float(f.kcal) * g / 100 for f, g in items)
        if carb_key:
            f = have[carb_key]
            rest = max(0.0, slot_kcal - used)
            grams = min(400.0, rest / (float(f.kcal) / 100)) if float(f.kcal) > 0 else 0.0
            if grams >= 20:
                items.append((f, grams))
        meals.append((time, name, items))
    # Ajuste final del día: se escalan los carbohidratos y las grasas para
    # caer a ±5 % de la meta sin mover la proteína.
    total = sum(float(f.kcal) * g / 100 for _, _, its in meals for f, g in its)
    if total > 0 and abs(total - kcal_goal) > 0.05 * kcal_goal:
        prot_kcal = sum(float(f.kcal) * g / 100 for _, _, its in meals for f, g in its
                        if float(f.protein_g) * 4 > 0.4 * float(f.kcal or 1))
        flex = total - prot_kcal
        if flex > 0:
            k = max(0.5, min(1.8, (kcal_goal - prot_kcal) / flex))
            meals = [(t, n, [(f, g if float(f.protein_g) * 4 > 0.4 * float(f.kcal or 1) else g * k) for f, g in its])
                     for t, n, its in meals]
    out_meals = []
    for time, name, its in meals:
        out_meals.append({"time": time, "name": name, "items": [
            {"food_id": str(f.id), "grams": _round5(g), "portion": _portion_label(f, _round5(g))} for f, g in its]})
    notes = ("Plan automático armado con tus metas y alimentos comunes en Colombia. Puedes cambiar alimentos y "
             "cantidades; las cifras se recalculan solas.")
    if restrictions:
        notes += " Respeta: " + ", ".join(RESTRICTION_LABELS.get(r, r).lower() for r in restrictions) + "."
    return {"notes": notes, "meals": out_meals,
            "targets": {k: targets[k] for k in ("kcal", "protein_g", "carbs_g", "fat_g")}}


# ─── Entreno ───

EXERCISES = {
    "gym": {
        "squat": "Sentadilla con barra", "hinge": "Peso muerto rumano", "lunge": "Zancadas con mancuernas",
        "leg_press": "Prensa de piernas", "leg_curl": "Curl femoral en máquina", "calf": "Elevación de talones",
        "push_h": "Press de banca", "push_i": "Press inclinado con mancuernas", "push_v": "Press militar con mancuernas",
        "pull_v": "Jalón al pecho", "pull_h": "Remo con barra", "row_1": "Remo con mancuerna a una mano",
        "fly": "Aperturas en máquina", "lat_raise": "Elevaciones laterales", "biceps": "Curl de bíceps con mancuernas",
        "triceps": "Extensión de tríceps en polea", "core": "Plancha", "core2": "Crunch en polea",
    },
    "home": {
        "squat": "Sentadilla con peso corporal", "hinge": "Puente de glúteo", "lunge": "Zancadas alternas",
        "leg_press": "Sentadilla búlgara", "leg_curl": "Curl femoral deslizante en el piso", "calf": "Elevación de talones",
        "push_h": "Flexiones de pecho", "push_i": "Flexiones con pies elevados", "push_v": "Flexiones en pica",
        "pull_v": "Dominadas asistidas con banda", "pull_h": "Remo invertido bajo una mesa", "row_1": "Remo con morral cargado",
        "fly": "Flexiones abiertas", "lat_raise": "Elevaciones laterales con botellas", "biceps": "Curl con morral",
        "triceps": "Fondos en silla", "core": "Plancha", "core2": "Bicho muerto",
    },
}
SPLITS = {
    "full_a": ("Cuerpo completo A", ["squat", "push_h", "pull_h", "hinge", "lat_raise", "core", "calf", "biceps"]),
    "full_b": ("Cuerpo completo B", ["hinge", "push_v", "pull_v", "lunge", "fly", "core2", "triceps", "calf"]),
    "full_c": ("Cuerpo completo C", ["leg_press", "push_i", "row_1", "leg_curl", "lat_raise", "core", "biceps", "triceps"]),
    "upper": ("Torso", ["push_h", "pull_h", "push_v", "pull_v", "lat_raise", "biceps", "triceps", "fly"]),
    "lower": ("Pierna", ["squat", "hinge", "lunge", "leg_curl", "calf", "core", "leg_press", "core2"]),
    "push": ("Empuje", ["push_h", "push_v", "push_i", "lat_raise", "triceps", "fly", "core", "calf"]),
    "pull": ("Tirón", ["pull_v", "pull_h", "row_1", "biceps", "core2", "lat_raise", "core", "calf"]),
    "legs": ("Pierna", ["squat", "hinge", "leg_press", "lunge", "leg_curl", "calf", "core", "core2"]),
}
SCHEDULE = {
    2: [(0, "full_a"), (3, "full_b")],
    3: [(0, "full_a"), (2, "full_b"), (4, "full_c")],
    4: [(0, "upper"), (1, "lower"), (3, "upper"), (4, "lower")],
    5: [(0, "upper"), (1, "lower"), (2, "push"), (3, "pull"), (4, "legs")],
    6: [(0, "push"), (1, "pull"), (2, "legs"), (3, "push"), (4, "pull"), (5, "legs")],
}
PER_SESSION = {30: 4, 45: 5, 60: 6, 90: 8}
FOCUS = {
    "strength": ("4-6", 150, "Carga pesada con técnica limpia: deja 1 a 2 repeticiones en reserva."),
    "hypertrophy": ("8-12", 90, "Lleva cada serie cerca del fallo y sube el peso cuando pases de 12 repeticiones."),
    "general": ("10-15", 75, "Controla la técnica y sube la dificultad poco a poco."),
    "fat_loss": ("12-15", 60, "Descansos cortos; suma 150 minutos de caminata o cardio suave por semana."),
}
SETS = {"beginner": 2, "intermediate": 3, "advanced": 4}


def training_plan(days_per_week: int, level: str, place: str, minutes: int, focus: str,
                  parq_flag: bool = False) -> dict:
    if parq_flag:
        level = "beginner"
    reps, rest, tip = FOCUS.get(focus, FOCUS["general"])
    n = PER_SESSION.get(minutes, 5)
    names = EXERCISES.get(place, EXERCISES["gym"])
    days = []
    for weekday, split in SCHEDULE.get(days_per_week, SCHEDULE[3]):
        title, keys = SPLITS[split]
        days.append({"weekday": weekday, "title": title, "exercises": [
            {"name": names[k], "sets": SETS.get(level, 3) + (1 if k in ("squat", "push_h", "hinge", "pull_v") and level != "beginner" else 0),
             "reps": "30-45 s" if k == "core" else reps, "rest_seconds": rest if k not in ("core", "core2", "calf") else 45,
             "notes": None} for k in keys[:n]]})
    notes = f"Plan automático de {days_per_week} días. {tip}"
    if parq_flag:
        notes += (" Tu cuestionario de salud del gimnasio tiene alguna alerta: empieza suave y consulta con un "
                  "médico antes de subir la intensidad.")
    return {"notes": notes, "days": days}
