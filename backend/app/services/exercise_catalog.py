"""Catálogo global de ejercicios: importación de free-exercise-db (MIT) a la
Master DB con vocabulario en español. Las imágenes se sirven desde el CDN del
dataset (públicas); si un día se quieren alojar, `IMAGE_BASE` cambia y ya."""
from __future__ import annotations

import json
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.master.exercise import Exercise

IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
DATASET_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"

MUSCLES_ES = {
    "abdominals": "Abdominales", "abductors": "Abductores", "adductors": "Aductores", "biceps": "Bíceps",
    "calves": "Pantorrillas", "chest": "Pecho", "forearms": "Antebrazos", "glutes": "Glúteos",
    "hamstrings": "Isquiotibiales", "lats": "Dorsales", "lower back": "Lumbares", "middle back": "Espalda media",
    "neck": "Cuello", "quadriceps": "Cuádriceps", "shoulders": "Hombros", "traps": "Trapecios", "triceps": "Tríceps",
}
EQUIPMENT_ES = {
    "barbell": "Barra", "dumbbell": "Mancuernas", "body only": "Peso corporal", "cable": "Polea", "machine": "Máquina",
    "kettlebells": "Kettlebell", "bands": "Bandas", "medicine ball": "Balón medicinal", "exercise ball": "Balón suizo",
    "foam roll": "Rodillo", "e-z curl bar": "Barra Z", "other": "Otro", None: "Sin equipo",
}
CATEGORY_ES = {
    "strength": "Fuerza", "stretching": "Estiramiento", "plyometrics": "Pliometría", "powerlifting": "Powerlifting",
    "olympic weightlifting": "Halterofilia", "strongman": "Strongman", "cardio": "Cardio",
}
LEVEL_ES = {"beginner": "Principiante", "intermediate": "Intermedio", "expert": "Avanzado"}
FORCE_ES = {"push": "Empuje", "pull": "Tracción", "static": "Estático"}

# Traducción de términos frecuentes en nombres (se aplica palabra a palabra; el
# nombre en inglés se conserva para búsqueda y para quien lo conozca así).
_NAME_TERMS = [
    ("Bent-Over", "inclinado"), ("Triceps Extension", "Extensión de tríceps"), ("Long Bar Row", "Remo con barra larga"), ("Floor Press", "Press en el suelo"), ("Preacher Curl", "Curl en banco Scott"),
    ("Two-Dumbbell", "con dos mancuernas"), ("Two-Arm", "a dos manos"), ("Double", "doble"), ("Bent-Arm", "con brazos flexionados"), ("Stiff-Legged", "con piernas rígidas"), ("Palms-Up", "con palmas arriba"), ("Upright Row", "Remo al mentón"), ("Long Bar", "con barra larga"), ("Low-Pulley", "en polea baja"), ("Side Lateral", "Elevación lateral"), ("Walking", "caminando"), ("Mid Row", "Remo medio"), ("Flyes", "Aperturas"), ("Rows", "Remo"), ("EZ-Bar", "con barra Z"), ("Bosu Ball", "en bosu"), ("Arnold", "Arnold"),
    ("Bodyweight", "con peso corporal"), ("Chair", "en silla"), ("Hack Squat", "Sentadilla hack"), ("Goblet Squat", "Sentadilla goblet"), ("Front Squat", "Sentadilla frontal"), ("Sumo", "sumo"), ("Split Squat", "Sentadilla búlgara"), ("Jump Squat", "Sentadilla con salto"),
    ("Full Squat", "Sentadilla profunda"), ("Bicep Curl", "Curl de bíceps"), ("Pushups", "Flexiones"), ("Push-Ups", "Flexiones"), ("Shoulder Press", "Press de hombro"), 
    ("Barbell", "con barra"), ("Dumbbell", "con mancuernas"), ("Dumbbells", "con mancuernas"), ("Kettlebell", "con kettlebell"),
    ("Cable", "en polea"), ("Machine", "en máquina"), ("Smith Machine", "en multipower"), ("Band", "con banda"), ("Bands", "con bandas"),
    ("Bench Press", "Press de banca"), ("Incline", "inclinado"), ("Decline", "declinado"), ("Press", "Press"),
    ("Squat", "Sentadilla"), ("Front Squat", "Sentadilla frontal"), ("Deadlift", "Peso muerto"), ("Romanian", "rumano"), ("Sumo", "sumo"),
    ("Lunge", "Zancada"), ("Lunges", "Zancadas"), ("Row", "Remo"), ("Bent Over", "inclinado"), ("Pull-Up", "Dominadas"), ("Pullup", "Dominadas"),
    ("Chin-Up", "Dominadas supinas"), ("Push-Up", "Flexiones"), ("Pushup", "Flexiones"), ("Push Ups", "Flexiones"), ("Dip", "Fondos"), ("Dips", "Fondos"),
    ("Curl", "Curl"), ("Hammer", "martillo"), ("Preacher", "en banco Scott"), ("Extension", "Extensión"), ("Extensions", "Extensiones"),
    ("Tricep", "de tríceps"), ("Triceps", "de tríceps"), ("Pushdown", "Extensión en polea"), ("Kickback", "Patada"),
    ("Shoulder", "de hombro"), ("Military", "militar"), ("Overhead", "por encima de la cabeza"), ("Lateral Raise", "Elevaciones laterales"),
    ("Front Raise", "Elevaciones frontales"), ("Raise", "Elevación"), ("Raises", "Elevaciones"), ("Shrug", "Encogimiento"), ("Shrugs", "Encogimientos"),
    ("Fly", "Aperturas"), ("Flyes", "Aperturas"), ("Crossover", "Cruce"), ("Pullover", "Pullover"), ("Lat Pulldown", "Jalón al pecho"), ("Pulldown", "Jalón"),
    ("Leg Press", "Prensa de piernas"), ("Leg Curl", "Curl femoral"), ("Leg Extension", "Extensión de cuádriceps"), ("Leg Extensions", "Extensiones de cuádriceps"),
    ("Calf Raise", "Elevación de talones"), ("Calf Raises", "Elevación de talones"), ("Standing", "de pie"), ("Seated", "sentado"), ("Lying", "acostado"),
    ("Hip Thrust", "Hip thrust"), ("Glute Bridge", "Puente de glúteo"), ("Bridge", "Puente"), ("Good Morning", "Buenos días"),
    ("Crunch", "Crunch"), ("Crunches", "Crunches"), ("Sit-Up", "Abdominal"), ("Sit-Ups", "Abdominales"), ("Plank", "Plancha"), ("Side Plank", "Plancha lateral"),
    ("Leg Raise", "Elevación de piernas"), ("Leg Raises", "Elevación de piernas"), ("Knee Raise", "Elevación de rodillas"), ("Russian Twist", "Giro ruso"),
    ("Mountain Climber", "Escalador"), ("Burpee", "Burpee"), ("Jump", "Salto"), ("Jumping", "con salto"), ("Box", "al cajón"), ("Step-Up", "Subida al cajón"),
    ("Clean", "Cargada"), ("Snatch", "Arranque"), ("Jerk", "Envión"), ("Swing", "Swing"), ("Thruster", "Thruster"), ("Farmer's Walk", "Caminata del granjero"),
    ("Stretch", "Estiramiento"), ("Stretches", "Estiramientos"), ("Rotation", "Rotación"), ("Twist", "Giro"), ("Hold", "Isométrico"),
    ("Wide-Grip", "agarre amplio"), ("Close-Grip", "agarre cerrado"), ("Medium Grip", "agarre medio"), ("Reverse Grip", "agarre invertido"), ("Underhand", "supino"), ("Overhand", "prono"),
    ("One-Arm", "a una mano"), ("One Arm", "a una mano"), ("One-Leg", "a una pierna"), ("Single-Leg", "a una pierna"), ("Alternating", "alterno"), ("Alternate", "alterno"),
    ("Chest", "de pecho"), ("Back", "de espalda"), ("Leg", "de pierna"), ("Arm", "de brazo"), ("Ab", "abdominal"), ("Hip", "de cadera"), ("Wrist", "de muñeca"), ("Neck", "de cuello"),
    ("With", "con"), ("On", "en"), ("To", "a"), ("Bench", "banco"), ("Floor", "en el suelo"), ("Wall", "en la pared"), ("Ball", "balón"), ("Rope", "cuerda"), ("Bar", "barra"),
]


# Palabras que en español van DESPUÉS del movimiento ("Press de banca con barra inclinado")
_MODIFIERS = [
    "Smith Machine", "Bent Over", "Bent-Over", "Two-Dumbbell", "Bodyweight", "Barbell", "Dumbbells", "Dumbbell", "Kettlebell",
    "Cable", "Machine", "Bands", "Band", "One-Arm", "One Arm", "Single-Arm", "Two-Arm", "Double", "Alternating", "Alternate",
    "Incline", "Decline", "Seated", "Standing", "Lying", "Kneeling", "Close-Grip", "Wide-Grip", "Single-Leg", "One-Leg",
    "Weighted", "Palms-Up", "Stiff-Legged", "Bent-Arm",
]
_MOD_RE = re.compile(r"\b(" + "|".join(re.escape(m) for m in sorted(_MODIFIERS, key=len, reverse=True)) + r")\b(?! Grip)")


def _reorder(main: str) -> str:
    mods = [m.group(1) for m in _MOD_RE.finditer(main)]
    if not mods:
        return main
    core = re.sub(r"\s+", " ", _MOD_RE.sub(" ", main)).strip(" -")
    if not core:
        return main
    return f"{core} {' '.join(mods)}"


def translate_name(name_en: str) -> str:
    """Traducción aproximada por términos (suficiente para reconocer el ejercicio;
    el gym puede renombrar al armar la rutina)."""
    main, sep, tail = name_en.partition(" - ")
    text = _reorder(main) + (f" - {tail}" if sep else "")
    for en, es in sorted(_NAME_TERMS, key=lambda t: -len(t[0])):
        text = re.sub(rf"\b{re.escape(en)}\b", es, text)
    text = re.sub(r"\s+", " ", text).strip(" -")
    return text[:1].upper() + text[1:] if text else name_en


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:120] or uuid.uuid4().hex[:12]


def normalize(raw: dict) -> dict:
    images = [IMAGE_BASE + p for p in raw.get("images") or []]
    return {
        "slug": slugify(raw.get("id") or raw["name"]),
        "name_en": raw["name"][:200],
        "name_es": translate_name(raw["name"])[:200],
        "category": raw.get("category") or "strength",
        "level": raw.get("level") or "beginner",
        "force": raw.get("force"),
        "mechanic": raw.get("mechanic"),
        "equipment": raw.get("equipment"),
        "primary_muscles": raw.get("primaryMuscles") or [],
        "secondary_muscles": raw.get("secondaryMuscles") or [],
        "instructions_en": raw.get("instructions") or [],
        "instructions_es": [],
        "images": images,
        "sort_weight": _popularity(raw),
    }


_POPULAR = ("bench press", "squat", "deadlift", "row", "pull-up", "pullup", "push-up", "pushup", "curl", "press", "lunge",
            "plank", "crunch", "lat pulldown", "leg press", "dip", "lateral raise", "hip thrust", "extension", "calf raise")


def _popularity(raw: dict) -> int:
    n = raw["name"].lower()
    score = 0
    if raw.get("equipment") in ("barbell", "dumbbell", "body only", "cable", "machine"):
        score += 2
    if raw.get("mechanic") == "compound":
        score += 2
    if any(p in n for p in _POPULAR):
        score += 3
    if raw.get("level") == "beginner":
        score += 1
    return score


async def import_exercises(db: AsyncSession, raw_list: list[dict]) -> dict:
    """Upsert por slug: idempotente, no toca los ejercicios que el gym ya usa."""
    existing = {e.slug: e for e in (await db.execute(select(Exercise))).scalars().all()}
    created = updated = 0
    for raw in raw_list:
        data = normalize(raw)
        row = existing.get(data["slug"])
        if row is None:
            db.add(Exercise(**data))
            created += 1
        else:
            for k, v in data.items():
                setattr(row, k, v)
            updated += 1
    await db.commit()
    return {"created": created, "updated": updated, "total": len(raw_list)}


def load_dataset(path: str | None = None) -> list[dict]:
    if path:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    import httpx
    resp = httpx.get(DATASET_URL, timeout=60.0, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


def exercise_out(e: Exercise) -> dict:
    return {
        "id": str(e.id), "slug": e.slug, "name_es": e.name_es, "name_en": e.name_en,
        "category": e.category, "category_es": CATEGORY_ES.get(e.category, e.category),
        "level": e.level, "level_es": LEVEL_ES.get(e.level, e.level),
        "force": e.force, "mechanic": e.mechanic,
        "equipment": e.equipment, "equipment_es": EQUIPMENT_ES.get(e.equipment, e.equipment or "Sin equipo"),
        "primary_muscles": e.primary_muscles, "primary_muscles_es": [MUSCLES_ES.get(m, m) for m in e.primary_muscles],
        "secondary_muscles": e.secondary_muscles, "secondary_muscles_es": [MUSCLES_ES.get(m, m) for m in e.secondary_muscles],
        "instructions": e.instructions_es or e.instructions_en,
        "instructions_lang": "es" if e.instructions_es else "en",
        "images": e.images,
    }
