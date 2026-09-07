"""Bloque 5: biblioteca de ejercicios, rutinas, asignación y pantalla del gym."""
import uuid

from app.services.exercise_catalog import translate_name, normalize
from tests.helpers import create_member

_TOKENS: dict[str, str] = {}

SAMPLE = [
    {"id": "Barbell_Bench_Press_-_Medium_Grip", "name": "Barbell Bench Press - Medium Grip", "force": "push", "level": "beginner",
     "mechanic": "compound", "equipment": "barbell", "primaryMuscles": ["chest"], "secondaryMuscles": ["shoulders", "triceps"],
     "instructions": ["Lie back on a flat bench.", "Press."], "category": "strength", "images": ["Barbell_Bench_Press_-_Medium_Grip/0.jpg", "Barbell_Bench_Press_-_Medium_Grip/1.jpg"]},
    {"id": "Barbell_Full_Squat", "name": "Barbell Full Squat", "force": "push", "level": "intermediate", "mechanic": "compound",
     "equipment": "barbell", "primaryMuscles": ["quadriceps"], "secondaryMuscles": ["glutes", "hamstrings"], "instructions": ["Squat."],
     "category": "strength", "images": ["Barbell_Full_Squat/0.jpg", "Barbell_Full_Squat/1.jpg"]},
    {"id": "Plank", "name": "Plank", "force": "static", "level": "beginner", "mechanic": "isolation", "equipment": "body only",
     "primaryMuscles": ["abdominals"], "secondaryMuscles": [], "instructions": ["Hold."], "category": "strength", "images": ["Plank/0.jpg", "Plank/1.jpg"]},
]


async def _owner_token(client, email="rutinas@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Rutinas", "gym_name": "Rutinas Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _seed_catalog():
    from app.db.master_session import MasterSessionLocal
    from app.services.exercise_catalog import import_exercises
    async with MasterSessionLocal() as db:
        return await import_exercises(db, SAMPLE)


def test_translation_and_normalize():
    assert translate_name("Barbell Bench Press - Medium Grip").startswith("Press de banca")
    assert "Sentadilla" in translate_name("Barbell Full Squat")
    n = normalize(SAMPLE[0])
    assert n["slug"] == "barbell-bench-press-medium-grip"
    assert n["images"][0].startswith("https://raw.githubusercontent.com/") and n["images"][0].endswith("/0.jpg")
    assert n["sort_weight"] >= 5


async def test_catalog_import_is_idempotent_and_searchable(client):
    token = await _owner_token(client)
    first = await _seed_catalog()
    second = await _seed_catalog()
    assert first["total"] == 3 and second["created"] == 0
    h = _auth(token)
    r = await client.get("/api/v1/exercises", params={"q": "sentadilla"}, headers=h)
    assert r.status_code == 200, r.text
    assert any(e["slug"] == "barbell-full-squat" for e in r.json())
    r = await client.get("/api/v1/exercises", params={"muscle": "chest", "q": "press de banca con barra"}, headers=h)
    hits = [e for e in r.json() if e["slug"] == "barbell-bench-press-medium-grip"]
    assert hits and all(e["primary_muscles"][0] == "chest" for e in r.json())
    assert hits[0]["primary_muscles_es"] == ["Pecho"] and hits[0]["equipment_es"] == "Barra"
    facets = (await client.get("/api/v1/exercises/facets", headers=h)).json()
    assert facets["total"] >= 3 and any(m["key"] == "quadriceps" for m in facets["muscles"])


async def test_routine_crud_assign_and_screen(client):
    token = await _owner_token(client)
    await _seed_catalog()
    h = _auth(token)
    by_slug = {}
    for raw in SAMPLE:
        found = (await client.get("/api/v1/exercises", params={"q": raw["name"]}, headers=h)).json()
        by_slug.update({e["slug"]: e for e in found})

    payload = {
        "name": "Full body 3 días", "goal": "hipertrofia", "level": "beginner", "is_public_on_screen": True,
        "days": [
            {"title": "Día 1 · Empuje", "exercises": [
                {"exercise_id": by_slug["barbell-bench-press-medium-grip"]["id"], "sets": 4, "reps": "8-10", "rest_seconds": 90},
                {"exercise_id": by_slug["plank"]["id"], "sets": 3, "reps": "45 seg", "rest_seconds": 45},
            ]},
            {"title": "Día 2 · Pierna", "exercises": [
                {"exercise_id": by_slug["barbell-full-squat"]["id"], "sets": 5, "reps": "5"},
            ]},
        ],
    }
    r = await client.post("/api/v1/routines", json=payload, headers=h)
    assert r.status_code == 201, r.text
    routine = r.json()
    assert routine["days_per_week"] == 2 and len(routine["days"][0]["exercises"]) == 2
    assert routine["days"][0]["exercises"][0]["exercise"]["images"]

    # Editar reemplaza la estructura completa
    payload["days"] = payload["days"][:1]
    r = await client.put(f"/api/v1/routines/{routine['id']}", json=payload, headers=h)
    assert r.status_code == 200 and len(r.json()["days"]) == 1

    bad = {**payload, "days": [{"title": "X", "exercises": [{"exercise_id": str(uuid.uuid4())}]}]}
    assert (await client.put(f"/api/v1/routines/{routine['id']}", json=bad, headers=h)).status_code == 400

    # Asignar a un socio: una vigente, la anterior al historial
    member = await create_member(client, h, full_name="Socio Rutina")
    r = await client.post(f"/api/v1/members/{member['id']}/routines", json={"routine_id": routine["id"]}, headers=h)
    assert r.status_code == 201, r.text
    r2 = await client.post("/api/v1/routines", json={**payload, "name": "Otra"}, headers=h)
    await client.post(f"/api/v1/members/{member['id']}/routines", json={"routine_id": r2.json()["id"]}, headers=h)
    mine = (await client.get(f"/api/v1/members/{member['id']}/routines", headers=h)).json()
    assert mine["current"]["routine_name"] == "Otra" and len(mine["history"]) == 1
    assert mine["current"]["routine"]["days"][0]["exercises"][0]["exercise_name"]

    # Pantalla del gym: solo rutinas públicas, con token de dispositivo
    dev = await client.post("/api/v1/kiosk/devices", json={"name": "TV sala"}, headers=h)
    assert dev.status_code == 201, dev.text
    kh = {"Authorization": f"Bearer {dev.json()['token']}"}
    listed = (await client.get("/api/v1/kiosk/routines", headers=kh)).json()
    assert any(x["id"] == routine["id"] for x in listed)
    detail = (await client.get(f"/api/v1/kiosk/routines/{routine['id']}", headers=kh)).json()
    assert detail["days"][0]["exercises"][0]["exercise"]["images"]
    # Sin token no hay pantalla
    assert (await client.get("/api/v1/kiosk/routines")).status_code in (401, 403)

    # Archivar la saca de la pantalla
    await client.delete(f"/api/v1/routines/{routine['id']}", headers=h)
    listed = (await client.get("/api/v1/kiosk/routines", headers=kh)).json()
    assert all(x["id"] != routine["id"] for x in listed)


def test_video_names_and_playable_filter():
    """Los nombres curados ganan y solo entran videos que el navegador abre."""
    from app.services.exercise_catalog import PLAYABLE_VIDEO_CODECS, PLAYABLE_VIDEO_EXT, translate_name

    assert translate_name("Romanian Deadlift") == "Peso muerto rumano"
    assert translate_name("Romanian Deadlift from Deficit").startswith("Peso muerto rumano")
    assert translate_name("Lying Leg Curls") == "Curl femoral acostado"
    # HEVC en .MOV es lo que publica casi todo wger: no debe pasar el filtro
    assert "mov" not in PLAYABLE_VIDEO_EXT
    assert "hevc" not in PLAYABLE_VIDEO_CODECS


async def test_gym_video_overrides_catalog_and_can_be_removed(client):
    """Cadena de respaldo: video del gym → video del catálogo → fotos."""
    token = await _owner_token(client)
    h = _auth(token)
    await _seed_catalog()
    found = (await client.get("/api/v1/exercises", params={"q": "Barbell Full Squat"}, headers=h)).json()
    ex = next(e for e in found if e["slug"] == "barbell-full-squat")
    assert ex["video_source"] is None, "el ejercicio de muestra no trae video"

    # MP4 mínimo: lo que valida el endpoint son los magic bytes, no la extensión
    mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
    up = await client.post(
        f"/api/v1/exercises/{ex['id']}/video",
        files={"file": ("clip.mp4", mp4, "video/mp4")}, headers=h,
    )
    assert up.status_code == 201, up.text
    assert up.json()["source"] == "gym"

    again = (await client.get("/api/v1/exercises", params={"q": "Barbell Full Squat"}, headers=h)).json()
    mine = next(e for e in again if e["slug"] == "barbell-full-squat")
    assert mine["video_source"] == "gym" and mine["video_url"]

    # Un archivo que no es video se rechaza aunque diga que lo es
    bad = await client.post(
        f"/api/v1/exercises/{ex['id']}/video",
        files={"file": ("x.mp4", b"no soy un video", "video/mp4")}, headers=h,
    )
    assert bad.status_code == 400

    gone = await client.delete(f"/api/v1/exercises/{ex['id']}/video", headers=h)
    assert gone.status_code == 200
    back = (await client.get("/api/v1/exercises", params={"q": "Barbell Full Squat"}, headers=h)).json()
    assert next(e for e in back if e["slug"] == "barbell-full-squat")["video_source"] is None
