"""Metas de energía y macronutrientes. Todo es una estimación de partida.

- Gasto en reposo: Mifflin-St Jeor (1990), la ecuación con mejor ajuste en
  adultos sanos según la revisión de la Academy of Nutrition and Dietetics.
- Gasto total: reposo × factor de actividad.
- Objetivo: déficit del 20 % para bajar grasa, superávit del 10 % para ganar
  músculo. Nunca por debajo del gasto en reposo ni del piso por sexo.
- Proteína (g/kg): posición de la ISSN (Jäger 2017) y el metaanálisis de
  Morton 2018 (beneficio que se aplana alrededor de 1,6 g/kg). Con IMC ≥ 30 se
  calcula sobre el peso de referencia de IMC 25.
- Grasa: 25 % de la energía y al menos 0,6 g/kg. Carbohidratos: el resto.
- Agua: ~35 ml/kg/día como punto de partida, más lo que se suda entrenando.
- Ritmo: la persona elige qué tan rápido (déficit 10/20/25 %, superávit 5/10 %).
  Un déficit nunca baja del piso, y si la pérdida esperada pasa del 1 % del
  peso por semana se avisa.
- Micronutrientes: fibra 14 g por 1.000 kcal (IOM), sodio < 2.000 mg (OMS),
  azúcares y grasa saturada < 10 % de la energía (OMS; la base informa
  azúcares totales, así que esa línea es orientativa) y las ingestas de
  referencia del IOM por sexo y edad para potasio, calcio, hierro y vitaminas.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

ACTIVITY = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "very_active": 1.9}
ACTIVITY_LABEL = {
    "sedentary": "Poco o nada de ejercicio",
    "light": "Ejercicio 1 a 3 días por semana",
    "moderate": "Ejercicio 3 a 5 días por semana",
    "active": "Ejercicio 6 a 7 días por semana",
    "very_active": "Ejercicio intenso a diario o trabajo físico",
}
GOAL_FACTOR = {"lose_fat": 0.80, "gain_muscle": 1.10, "maintain": 1.0, "performance": 1.0, "health": 1.0}
#: Ritmo elegido → factor sobre el gasto total. Sin ritmo se usa GOAL_FACTOR.
PACE_FACTOR = {
    "lose_fat": {"gentle": 0.90, "moderate": 0.80, "aggressive": 0.75},
    "gain_muscle": {"lean": 1.05, "standard": 1.10},
}
PACE_LABEL = {
    "gentle": "Suave (−10 %)", "moderate": "Moderado (−20 %)", "aggressive": "Fuerte (−25 %)",
    "lean": "Limpio (+5 %)", "standard": "Estándar (+10 %)",
}
PROTEIN_G_PER_KG = {"lose_fat": 2.0, "gain_muscle": 1.8, "maintain": 1.6, "performance": 1.6, "health": 1.4}
KCAL_PER_KG_TISSUE = 7700
#: Por debajo de esto no se proponen metas sin acompañamiento profesional.
CALORIE_FLOOR = {"female": 1200, "male": 1500, "other": 1350}
MIN_AGE = 18

REFERENCES = [
    "Mifflin MD y col. Am J Clin Nutr 1990;51:241-7 (ecuación de gasto en reposo).",
    "Jäger R y col. Posición de la ISSN: proteína y ejercicio. J Int Soc Sports Nutr 2017;14:20.",
    "Morton RW y col. Metaanálisis de suplementación de proteína y fuerza. Br J Sports Med 2018;52:376-84.",
    "OMS. Directrices sobre actividad física y comportamiento sedentario, 2020.",
    "Institute of Medicine. Dietary Reference Intakes (fibra, minerales y vitaminas), 2005-2019.",
    "OMS. Directrices sobre ingesta de sodio (2012) y de azúcares (2015); grasas saturadas (2023).",
]


class MissingData(ValueError):
    """Faltan datos para calcular (la pantalla dice cuáles)."""

    def __init__(self, missing: list[str]):
        super().__init__(", ".join(missing))
        self.missing = missing


@dataclass
class Targets:
    bmr: int
    tdee: int
    kcal: int
    protein_g: int
    fat_g: int
    carbs_g: int
    water_ml: int
    clamped: bool
    fiber_g: int = 25
    weekly_change_kg: float = 0.0
    too_fast: bool = False
    pace: Optional[str] = None
    micro: Optional[dict] = None

    def as_dict(self) -> dict:
        return {
            "bmr": self.bmr, "tdee": self.tdee, "kcal": self.kcal, "protein_g": self.protein_g,
            "fat_g": self.fat_g, "carbs_g": self.carbs_g, "water_ml": self.water_ml, "clamped": self.clamped,
            "fiber_g": self.fiber_g, "weekly_change_kg": self.weekly_change_kg, "too_fast": self.too_fast,
            "pace": self.pace, "pace_label": PACE_LABEL.get(self.pace or ""), "micro": self.micro or {},
        }


def micro_targets(sex: str, age: int, kcal: float) -> dict:
    """Referencias diarias. `kind`: min (llegar al menos) o max (no pasar)."""
    female = sex == "female"
    iron = 18 if female and age <= 50 else 8
    calcium = 1200 if (female and age > 50) or age > 70 else 1000
    return {
        "sodium_mg": {"value": 2000, "kind": "max"},
        "sugars_g": {"value": round(0.10 * kcal / 4), "kind": "max"},
        "sat_fat_g": {"value": round(0.10 * kcal / 9), "kind": "max"},
        "potassium_mg": {"value": 2600 if female else 3400, "kind": "min"},
        "calcium_mg": {"value": calcium, "kind": "min"},
        "iron_mg": {"value": iron, "kind": "min"},
        "vit_c_mg": {"value": 75 if female else 90, "kind": "min"},
        "vit_a_ug": {"value": 700 if female else 900, "kind": "min"},
        "vit_d_ug": {"value": 20 if age > 70 else 15, "kind": "min"},
        "vit_b12_ug": {"value": 2.4, "kind": "min"},
    }


def age_on(birth: date, today: date) -> int:
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def bmr_mifflin(sex: str, weight_kg: float, height_cm: float, age: int) -> float:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return base + {"male": 5, "female": -161}.get(sex, -78)


def compute(*, sex: Optional[str], weight_kg: Optional[float], height_cm: Optional[float],
            birth_date: Optional[date], activity: Optional[str], goal: Optional[str], today: date,
            pace: Optional[str] = None) -> Targets:
    missing = [k for k, v in (("sexo", sex), ("peso", weight_kg), ("talla", height_cm),
                              ("fecha de nacimiento", birth_date), ("nivel de actividad", activity),
                              ("objetivo", goal)) if not v]
    if missing:
        raise MissingData(missing)
    age = age_on(birth_date, today)
    if age < MIN_AGE:
        raise ValueError("Las metas de alimentación son para mayores de 18 años. Consulta con un nutricionista.")
    w, h = float(weight_kg), float(height_cm)
    bmr = bmr_mifflin(sex, w, h, age)
    tdee = bmr * ACTIVITY[activity]
    pace = pace if pace in PACE_FACTOR.get(goal, {}) else None
    factor = PACE_FACTOR[goal][pace] if pace else GOAL_FACTOR[goal]
    target = tdee * factor
    floor = max(CALORIE_FLOOR.get(sex, 1350), bmr)
    clamped = target < floor
    kcal = max(target, floor)
    weekly = round((kcal - tdee) * 7 / KCAL_PER_KG_TISSUE, 2)
    ref_weight = min(w, 25 * (h / 100) ** 2)
    protein = PROTEIN_G_PER_KG[goal] * ref_weight
    fat = max(0.25 * kcal / 9, 0.6 * w)
    carbs = max((kcal - protein * 4 - fat * 9) / 4, 0)
    return Targets(
        bmr=round(bmr), tdee=round(tdee), kcal=round(kcal), protein_g=round(protein), fat_g=round(fat),
        carbs_g=round(carbs), water_ml=int(round(35 * w / 50) * 50), clamped=clamped,
        fiber_g=round(14 * kcal / 1000), weekly_change_kg=weekly, too_fast=weekly < -0.01 * w,
        pace=pace, micro=micro_targets(sex, age, kcal),
    )


def macros_for(grams: float, per100: dict) -> dict:
    f = grams / 100
    return {k: round(float(per100.get(k) or 0) * f, 1) for k in ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")}
