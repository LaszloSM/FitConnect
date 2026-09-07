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
    "Weighted", "Palms-Up", "Stiff-Legged", "Bent-Arm", "Romanian", "Hammer", "Side", "Walking", "Front", "Rear",
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


# Traducciones exactas para los ejercicios más comunes: el traductor por términos
# acierta el grueso pero destroza algunos nombres compuestos.
NAME_OVERRIDES = {
    "Romanian Deadlift": "Peso muerto rumano",
    "Barbell Hip Thrust": "Hip thrust con barra",
    "Lying Leg Curls": "Curl femoral acostado",
    "Standing Leg Curl": "Curl femoral de pie",
    "Seated Leg Curl": "Curl femoral sentado",
    "Hammer Curls": "Curl martillo",
    "Side Lateral Raise": "Elevaciones laterales",
    "Front Dumbbell Raise": "Elevaciones frontales con mancuernas",
    "Machine Preacher Curls": "Curl en banco Scott en máquina",
    "Preacher Curl": "Curl en banco Scott",
    "Calf-Machine Shoulder Shrug": "Encogimiento de hombros en máquina de pantorrilla",
    "Barbell Walking Lunge": "Zancada caminando con barra",
    "Cable One Arm Tricep Extension": "Extensión de tríceps en polea a una mano",
    "Tricep Dumbbell Kickback": "Patada de tríceps con mancuerna",
    "Decline Dumbbell Triceps Extension": "Extensión de tríceps con mancuerna en declinado",
    "Cable Incline Triceps Extension": "Extensión de tríceps en polea inclinado",
    "Dip Machine": "Fondos en máquina",
    "Pullups": "Dominadas",
    "Weighted Pull Ups": "Dominadas con peso",
    "Face Pull": "Face pull",
    "Leg Press": "Prensa de piernas",
    "Front Barbell Squat": "Sentadilla frontal con barra",
    "Machine Bench Press": "Press de banca en máquina",
    "Standing Biceps Cable Curl": "Curl de bíceps en polea de pie",
    "Barbell Squat": "Sentadilla con barra",
    "Barbell Deadlift": "Peso muerto con barra",
    "Barbell Bench Press - Medium Grip": "Press de banca con barra",
    "Pushups": "Flexiones de pecho",
    "Plank": "Plancha",
}


def translate_name(name_en: str) -> str:
    """Traducción aproximada por términos (suficiente para reconocer el ejercicio;
    el gym puede renombrar al armar la rutina)."""
    if name_en in NAME_OVERRIDES:
        return NAME_OVERRIDES[name_en]
    main, sep, tail = name_en.partition(" - ")
    # "Romanian Deadlift from Deficit": lo que sigue a "from" es una aclaración,
    # no parte del movimiento; se reordena solo la cabeza.
    head, from_sep, from_tail = main.partition(" from ")
    text = _reorder(head) + (f" desde {from_tail}" if from_sep else "") + (f" - {tail}" if sep else "")
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
        "video_url": e.video_url,
        "video_license": e.video_license,
        "video_author": e.video_author,
    }


WGER_API = "https://wger.de/api/v2"
# Lo que un navegador reproduce sin plugins (HEVC no entra: Chrome no lo abre)
PLAYABLE_VIDEO_EXT = {"mp4", "webm"}
PLAYABLE_VIDEO_CODECS = {"h264", "avc1", "vp8", "vp9", "av1", ""}


# Palabras que no distinguen un ejercicio de otro
_STOPWORDS = {"the", "a", "with", "on", "of", "and", "in", "to", "for", "version", "machine", "laying", "sitting"}


def _tokens(name: str) -> frozenset[str]:
    """Palabras significativas en singular: los catálogos escriben el mismo
    ejercicio de formas distintas ("Front Squats" vs "Front Squat")."""
    words = re.findall(r"[a-z]+", name.lower())
    return frozenset(w.rstrip("s") if len(w) > 3 else w for w in words if w not in _STOPWORDS)


def _best_match(name: str, catalog: list) -> object | None:
    """El ejercicio del catálogo que contiene todas las palabras del nombre de
    wger y agrega las menos posibles. "Bench Press" cae en "Barbell Bench Press",
    no en "Decline Bench Press" si ambos existen; a igual cercanía gana el más
    popular (sort_weight)."""
    want = _tokens(name)
    if not want:
        return None
    best, best_extra = None, 99
    for e in catalog:
        have = _tokens(e.name_en)
        if not want <= have:
            continue
        extra = len(have - want)
        if extra < best_extra or (extra == best_extra and best is not None and e.sort_weight > best.sort_weight):
            best, best_extra = e, extra
    return best


async def import_wger_videos(db: AsyncSession) -> dict:
    """Trae los videos de wger (CC-BY-SA) y los cruza por nombre con el catálogo.

    Son pocos (~78 de 876) pero cubren los básicos, que son justo los que más se
    consultan en la pantalla del gym. La atribución se guarda porque la licencia
    la exige. Idempotente: vuelve a correr sin duplicar nada.
    """
    import httpx

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http:
        videos = (await http.get(f"{WGER_API}/video/", params={"limit": 500, "format": "json"})).json().get("results", [])
        # El nombre vive en /exerciseinfo, no en el video
        infos = (await http.get(f"{WGER_API}/exerciseinfo/", params={"limit": 1000, "format": "json"})).json().get("results", [])

    names: dict[int, str] = {}
    for info in infos:
        for tr in info.get("translations", []):
            if tr.get("language") == 2 and tr.get("name"):  # 2 = inglés, como free-exercise-db
                names[info["id"]] = tr["name"]
                break

    catalog = (await db.execute(select(Exercise))).scalars().all()

    # Se reconstruye desde cero: si un video dejó de servir (formato, o wger lo
    # quitó) no puede quedar una URL muerta apuntando a un cuadro negro.
    for e in catalog:
        e.video_url = e.video_license = e.video_author = None

    linked = 0
    taken: set = set()
    skipped_format = 0
    for v in videos:
        name = names.get(v.get("exercise"))
        url = v.get("video")
        if not name or not url:
            continue
        # Un video que el navegador no reproduce deja un cuadro negro en la
        # pantalla del gym, peor que las dos fotos. wger publica casi todo en
        # .MOV/HEVC, que Chrome no abre: solo entra lo que se ve seguro.
        if not url.lower().rsplit(".", 1)[-1] in PLAYABLE_VIDEO_EXT or (v.get("codec") or "").lower() not in PLAYABLE_VIDEO_CODECS:
            skipped_format += 1
            continue
        target = _best_match(name, catalog)
        # Un mismo ejercicio del catálogo no se queda con dos videos distintos
        if target is None or target.id in taken:
            continue
        taken.add(target.id)
        target.video_url = url[:500]
        target.video_license = (v.get("license_title") or "CC-BY-SA")[:80]
        target.video_author = (v.get("license_author") or "wger")[:120]
        linked += 1

    await db.commit()
    return {"videos": len(videos), "linked": linked, "skipped_format": skipped_format}
