"""Planes automáticos, sin IA. Salen siempre: cuando no hay llave del
proveedor, cuando se acabó la cuota o cuando el modelo falla.

- Comidas: plantillas por tiempo de comida con alimentos comunes en Colombia.
  Las reglas eligen los alimentos y `portion_fit` ajusta los gramos para
  cumplir a la vez calorías, proteína, grasa y carbohidratos, con porciones
  razonables para cada alimento.
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
from app.services import portion_fit

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
        "protein": ["huevo_cocido", "yogur_griego", "queso_mozzarella_semi", "tofu_firme"],
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
        "protein": ["tilapia_cocida", "pechuga_pollo_asada", "huevo_cocido", "atun_agua_usda", "lomo_cerdo_asado",
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
#: Proteína de refuerzo cuando la comida elegida no alcanza la meta del día
#: (típico en planes vegetarianos o con desayunos de pocos huevos).
BOOSTERS = {
    "breakfast": ["clara_huevo", "yogur_griego", "queso_cottage", "tofu_firme"],
    "lunch": ["pechuga_pollo_asada", "tofu_firme", "huevo_cocido", "lentejas_cocidas"],
    "dinner": ["pechuga_pollo_asada", "tofu_firme", "huevo_cocido", "garbanzos_cocidos"],
    "snack": ["yogur_griego", "queso_cottage", "huevo_cocido", "clara_huevo"],
}
FAT_BOOSTERS = {
    "breakfast": ["aguacate_usda", "mani_tostado_usda"], "lunch": ["aguacate_usda", "aceite_oliva_usda"],
    "dinner": ["aguacate_usda", "aceite_oliva_usda"], "snack": ["mani_tostado_usda", "almendras"],
}
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
    keys = ({k for meal in OPTIONS.values() for opts in meal.values() for k in opts} | set(VEG_MIX)
            | {k for opts in BOOSTERS.values() for k in opts} | {k for opts in FAT_BOOSTERS.values() for k in opts})
    rows = (await adb.execute(select(Food).where(Food.ref_key.in_(keys), Food.owner_id.is_(None)))).scalars().all()
    return {f.ref_key: f for f in rows}


def _pick(options: list[str], banned: set[str], have: dict[str, Food], seed: int) -> Optional[str]:
    ok = [k for k in options if k not in banned and (k in have or k == "ensalada")]
    return ok[seed % len(ok)] if ok else None


#: Porciones razonables por alimento (mínimo, máximo, múltiplo en gramos).
FOOD_BOUNDS = {
    "huevo_cocido": (50, 150, 50), "clara_huevo": (66, 198, 33), "yogur_griego": (120, 300, 10), "queso_mozzarella_semi": (20, 60, 5),
    "queso_cottage": (60, 200, 10), "tofu_firme": (80, 220, 10), "mani_tostado_usda": (15, 40, 5),
    "almendras": (15, 40, 5), "aguacate_usda": (30, 100, 5), "aceite_oliva_usda": (3, 20, 1),
    "avena_usda": (30, 80, 5), "pan_integral_usda": (28, 112, 28), "tcac_5": (40, 240, 5),
    "tortilla_maiz": (26, 130, 26), "lentejas_cocidas": (100, 300, 10), "frijol_rojo_cocido": (100, 300, 10),
    "garbanzos_cocidos": (100, 300, 10),
}
ROLE_BOUNDS = {"protein": (60, 250, 5), "carb": (40, 300, 5), "veg": (60, 200, 10), "fruit": (80, 220, 10),
               "fat": (5, 60, 5), "mix": (20, 80, 5)}


def _item(key: str, role: str, food: Food, scale: float) -> portion_fit.Item:
    """Los alimentos con porción conocida (huevos, quesos, aceite) tienen su
    propio tope; los demás crecen en proporción con metas altas."""
    if key in FOOD_BOUNDS:
        lo, hi, step = FOOD_BOUNDS[key]
    else:
        lo, hi, step = ROLE_BOUNDS[role]
        hi = hi * scale if role in ("protein", "carb", "fruit") else hi
    usual = next((float(p["grams"]) for p in food.portions or [] if p.get("label") != "100 g"), None)
    typical = min(hi, max(lo, usual * (scale if role == "carb" else 1))) if usual else None
    return portion_fit.Item(food=food, lo=lo, hi=hi, step=step, typical=typical)


def _plural(word: str) -> str:
    return word + ("s" if word[-1] in "aeiouáéó" else "es")


def _portion_label(food: Food, grams: float) -> Optional[str]:
    """La porción casera que corresponde a los gramos («1 taza», «3 huevos»)."""
    for p in food.portions or []:
        label, pg = p.get("label") or "", float(p.get("grams") or 0)
        if label == "100 g" or pg <= 0:
            continue
        if abs(pg - grams) <= max(5, 0.1 * grams):
            return label
        parts = label.split(" ")
        n = grams / pg
        if len(parts) == 2 and parts[0] == "1" and abs(n - round(n)) < 0.08 and 2 <= round(n) <= 6:
            return f"{round(n)} {_plural(parts[1])}"
    return None


async def meal_plan(adb: AsyncSession, user_id, targets: dict, meals_per_day: int,
                    restrictions: list[str], day: date) -> dict:
    """Plan del día como el que validaría `plans.validate_meals` (con ids).

    Las reglas eligen los alimentos de cada comida; las cantidades las ajusta
    `portion_fit` para cumplir calorías y macros a la vez."""
    have = await _foods(adb)
    banned = set().union(*(RESTRICTED.get(r, set()) for r in restrictions)) if restrictions else set()
    slots: list[tuple[str, str, portion_fit.Slot]] = []
    # Con metas altas o con solo tres comidas, cada porción puede ser más grande.
    scale = max(1.0, float(targets["kcal"]) / 2000) * (4 / 3 if meals_per_day == 3 else 1.0)
    for i, (time, name, kind, share) in enumerate(SLOTS.get(meals_per_day, SLOTS[3])):
        opts = OPTIONS[kind]
        seed = _seed(user_id, day, f"{i}")
        slot = portion_fit.Slot(share=share)
        for role, sub in (("protein", seed), ("veg", seed // 7), ("fruit", seed // 7), ("fat", seed // 7), ("carb", seed // 13)):
            key = _pick(opts.get(role, []), banned, have, sub)
            if not key:
                continue
            if key == "ensalada":
                slot.items += [_item(k, "mix", have[k], scale) for k in VEG_MIX if k in have]
            else:
                slot.items.append(_item(key, role, have[key], scale))
        slots.append((time, name, slot))
    grams = portion_fit.fit([s for _, _, s in slots], targets)
    # Si con lo elegido no se llega a la proteína, se agrega un refuerzo en
    # las comidas más grandes (hasta dos) y se vuelve a ajustar.
    # Si con lo elegido no se llega a la proteína o a la grasa, se agrega un
    # refuerzo en las comidas más grandes y se vuelve a ajustar.
    kinds = [k for _, _, k, _ in SLOTS.get(meals_per_day, SLOTS[3])]
    order = sorted(range(len(slots)), key=lambda n: -(slots[n][2].share or 0))
    for macro, role, options, limit in (("protein_g", "protein", BOOSTERS, 3), ("fat_g", "fat", FAT_BOOSTERS, 2)):
        for n in order[:limit]:
            if portion_fit.totals([s for _, _, s in slots], grams)[macro] >= 0.92 * float(targets[macro]):
                break
            present = {it.food.ref_key for it in slots[n][2].items}
            key = next((k for k in options[kinds[n]] if k in have and k not in banned and k not in present), None)
            if key:
                slots[n][2].items.append(_item(key, role, have[key], scale))
                grams = portion_fit.fit([s for _, _, s in slots], targets)
    out_meals = []
    for (time, name, slot), gs in zip(slots, grams):
        out_meals.append({"time": time, "name": name, "items": [
            {"food_id": str(it.food.id), "grams": g, "portion": _portion_label(it.food, g)} for it, g in zip(slot.items, gs)]})
    notes = ("Plan automático armado con tus metas y alimentos comunes en Colombia. Puedes cambiar alimentos y "
             "cantidades; las cifras se recalculan solas.")
    if restrictions:
        notes += " Respeta: " + ", ".join(RESTRICTION_LABELS.get(r, r).lower() for r in restrictions) + "."
    protein = portion_fit.totals([s for _, _, s in slots], grams)["protein_g"]
    if protein < 0.9 * float(targets["protein_g"]):
        notes += (f" Con estos alimentos la proteína llega a {round(protein)} g de los {round(float(targets['protein_g']))} g "
                  "de tu meta: si puedes, suma una porción de huevo, lácteos o legumbres.")
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
