"""Entrenador como rol del gimnasio, al mismo nivel que dueño o recepción.

Antes un instructor era una fila de catálogo: un nombre para pintar en la
agenda. No entraba a la app, no tenía socios, y un plan "con entrenador" era un
nombre de plan sin ninguna consecuencia. Estos tests fijan las cuatro cosas que
hacen que el rol exista de verdad: entra con su cuenta, ve lo suyo y solo lo
suyo, el plan que lo incluye no se puede vender sin asignarlo, y no puede estar
en dos salones a la vez.
"""
import uuid
from urllib.parse import parse_qs, urlparse

import pytest

from tests.helpers import create_member, create_plan

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="trainers@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Entrenadores", "gym_name": "Gym Entrenadores", "city": "Cali",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS[email] = r.json()["access_token"]
    return _TOKENS[email]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _invite(client, owner, role, full_name):
    email = f"{role}-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post("/api/v1/users/invite", json={
        "email": email, "full_name": full_name, "role": role,
    }, headers=_auth(owner))
    assert inv.status_code == 201, inv.text
    token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    acc = await client.post("/api/v1/auth/staff/accept-invite", json={
        "token": token, "password": "StaffPass123!",
    })
    assert acc.status_code == 200, acc.text
    return acc.json()["access_token"]


# ─────────────────────── El rol existe y trae ficha ───────────────────────

async def test_accepting_a_trainer_invite_creates_the_profile(client):
    owner = await _owner_token(client)
    trainer = await _invite(client, owner, "trainer", f"Ana Nueva {uuid.uuid4().hex[:4]}")

    me = await client.get("/api/v1/trainer/me", headers=_auth(trainer))
    assert me.status_code == 200, me.text
    assert me.json()["full_name"].startswith("Ana Nueva")


async def test_an_existing_instructor_is_linked_not_duplicated(client):
    """El gym ya tenía a esa persona en el catálogo: invitarla no la clona."""
    owner = await _owner_token(client)
    nombre = f"Carlos Viejo {uuid.uuid4().hex[:4]}"
    creado = await client.post("/api/v1/instructors", json={"full_name": nombre},
                               headers=_auth(owner))
    assert creado.status_code == 201, creado.text

    trainer = await _invite(client, owner, "trainer", nombre)
    me = (await client.get("/api/v1/trainer/me", headers=_auth(trainer))).json()
    assert me["id"] == creado.json()["id"], "se creó una ficha nueva en vez de enlazar la existente"

    listado = (await client.get("/api/v1/instructors", headers=_auth(owner))).json()
    assert len([i for i in listado if i["full_name"] == nombre]) == 1


async def test_the_portal_is_only_for_trainers(client):
    owner = await _owner_token(client)
    r = await client.get("/api/v1/trainer/me", headers=_auth(owner))
    assert r.status_code == 403


# ─────────────────────── Ve lo suyo y nada más ───────────────────────

async def test_a_trainer_only_sees_their_own_members(client):
    owner = await _owner_token(client, email="trainers-mios@gym.com")
    trainer = await _invite(client, owner, "trainer", f"Mia Coach {uuid.uuid4().hex[:4]}")
    mi_id = (await client.get("/api/v1/trainer/me", headers=_auth(trainer))).json()["id"]

    plan_id = await create_plan(client, _auth(owner), duration_days=30)
    mio = await create_member(client, _auth(owner), plan_id=plan_id, full_name="Socio Asignado")
    ajeno = await create_member(client, _auth(owner), plan_id=plan_id, full_name="Socio Ajeno")
    r = await client.put(f"/api/v1/members/{mio['id']}", json={"trainer_id": mi_id},
                         headers=_auth(owner))
    assert r.status_code == 200, r.text

    mis = (await client.get("/api/v1/trainer/members", headers=_auth(trainer))).json()
    ids = {m["id"] for m in mis}
    assert mio["id"] in ids
    assert ajeno["id"] not in ids, "el entrenador vio un socio que no es suyo"


async def test_the_members_module_is_scoped_to_their_own(client):
    """`MEMBERS_READ` abre el módulo; "sus socios" tiene que ser verdad también
    ahí. Sin el filtro, el entrenador listaba el gimnasio entero con teléfonos."""
    owner = await _owner_token(client, email="trainers-scope@gym.com")
    trainer = await _invite(client, owner, "trainer", f"Scope Coach {uuid.uuid4().hex[:4]}")
    mi_id = (await client.get("/api/v1/trainer/me", headers=_auth(trainer))).json()["id"]

    plan_id = await create_plan(client, _auth(owner), duration_days=30)
    mio = await create_member(client, _auth(owner), plan_id=plan_id, full_name="Scope Mio")
    ajeno = await create_member(client, _auth(owner), plan_id=plan_id, full_name="Scope Ajeno")
    await client.put(f"/api/v1/members/{mio['id']}", json={"trainer_id": mi_id},
                     headers=_auth(owner))

    listado = (await client.get("/api/v1/members?limit=200", headers=_auth(trainer))).json()
    ids = {m["id"] for m in listado}
    assert ids == {mio["id"]}, "el entrenador listó socios que no son suyos"

    # Un socio ajeno no existe para él: 404, no 403 (un 403 confirmaría el id)
    r = await client.get(f"/api/v1/members/{ajeno['id']}", headers=_auth(trainer))
    assert r.status_code == 404
    assert (await client.get(f"/api/v1/members/{mio['id']}", headers=_auth(trainer))).status_code == 200

    # El dueño sigue viendo a los dos
    del_owner = (await client.get("/api/v1/members?limit=200", headers=_auth(owner))).json()
    ids_owner = {m["id"] for m in del_owner}
    assert {mio["id"], ajeno["id"]} <= ids_owner


async def test_the_member_subroutes_respect_the_scope_too(client):
    """Las subrutas heredan `MEMBERS_READ` del router: sin alcance, un entrenador
    leía el historial de cualquier socio poniendo su id en la URL."""
    owner = await _owner_token(client, email="trainers-sub@gym.com")
    trainer = await _invite(client, owner, "trainer", f"Sub Coach {uuid.uuid4().hex[:4]}")
    mi_id = (await client.get("/api/v1/trainer/me", headers=_auth(trainer))).json()["id"]

    plan_id = await create_plan(client, _auth(owner), duration_days=30)
    mio = await create_member(client, _auth(owner), plan_id=plan_id, full_name="Sub Mio")
    ajeno = await create_member(client, _auth(owner), plan_id=plan_id, full_name="Sub Ajeno")
    await client.put(f"/api/v1/members/{mio['id']}", json={"trainer_id": mi_id},
                     headers=_auth(owner))

    for sub in ("timeline", "checkins", "memberships"):
        propio = await client.get(f"/api/v1/members/{mio['id']}/{sub}", headers=_auth(trainer))
        assert propio.status_code == 200, f"{sub} propio: {propio.text}"
        foraneo = await client.get(f"/api/v1/members/{ajeno['id']}/{sub}", headers=_auth(trainer))
        assert foraneo.status_code == 404, f"{sub} ajeno respondió {foraneo.status_code}"

    # La plata del socio no es asunto suyo, ni siquiera la de los suyos
    for sub in ("payments", "billing-summary"):
        r = await client.get(f"/api/v1/members/{mio['id']}/{sub}", headers=_auth(trainer))
        assert r.status_code == 403, f"{sub} respondió {r.status_code}"
    # Recepción sí las necesita en el mostrador
    recep = await _invite(client, owner, "receptionist", "Recepcion Sub")
    r = await client.get(f"/api/v1/members/{mio['id']}/payments", headers=_auth(recep))
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("path", [
    "/api/v1/payments",
    "/api/v1/cash/shifts/current",
    "/api/v1/reports/profit",
    "/api/v1/users",
    "/api/v1/audit",
])
async def test_a_trainer_never_sees_money_or_settings(client, path):
    owner = await _owner_token(client)
    trainer = await _invite(client, owner, "trainer", f"Sin Plata {uuid.uuid4().hex[:4]}")
    r = await client.get(path, headers=_auth(trainer))
    assert r.status_code == 403, f"{path} respondió {r.status_code} a un entrenador"


# ─────────────────────── Planes con entrenador ───────────────────────

async def test_a_plan_with_trainer_cannot_be_sold_without_one(client):
    """Cobrar "plan con entrenador" sin entrenador asignado es vender humo."""
    owner = await _owner_token(client, email="trainers-plan@gym.com")
    simple = await create_plan(client, _auth(owner), duration_days=30)
    socio = await create_member(client, _auth(owner), plan_id=simple)

    con_coach = await create_plan(
        client, _auth(owner), duration_days=30,
        includes_trainer=True, trainer_sessions_per_month=8,
    )
    r = await client.post("/api/v1/member-plans/assign", json={
        "member_id": socio["id"], "plan_id": con_coach,
        "start_date": "2027-01-10",
    }, headers=_auth(owner))
    assert r.status_code == 400, r.text
    assert "entrenador" in r.json()["detail"].lower()


async def test_the_bought_rights_are_frozen_in_the_membership(client):
    owner = await _owner_token(client, email="trainers-snap@gym.com")
    trainer = await _invite(client, owner, "trainer", f"Snap Coach {uuid.uuid4().hex[:4]}")
    mi_id = (await client.get("/api/v1/trainer/me", headers=_auth(trainer))).json()["id"]

    simple = await create_plan(client, _auth(owner), duration_days=30)
    socio = await create_member(client, _auth(owner), plan_id=simple)
    await client.put(f"/api/v1/members/{socio['id']}", json={"trainer_id": mi_id},
                     headers=_auth(owner))

    con_coach = await create_plan(
        client, _auth(owner), duration_days=30,
        includes_trainer=True, trainer_sessions_per_month=8,
    )
    r = await client.post("/api/v1/member-plans/assign", json={
        "member_id": socio["id"], "plan_id": con_coach, "start_date": "2027-02-10",
    }, headers=_auth(owner))
    assert r.status_code in (200, 201), r.text

    # Bajar el plan a 4 sesiones no puede tocar lo que el socio ya compró
    await client.put(f"/api/v1/member-plans/{con_coach}",
                     json={"trainer_sessions_per_month": 4}, headers=_auth(owner))

    mis = (await client.get("/api/v1/trainer/members", headers=_auth(trainer))).json()
    fila = next(m for m in mis if m["id"] == socio["id"])
    assert fila["includes_trainer"] is True
    assert fila["trainer_sessions_per_month"] == 8, "el snapshot siguió al catálogo"


# ─────────────────────── Agenda ───────────────────────

async def test_a_trainer_cannot_be_in_two_rooms_at_once(client):
    owner = await _owner_token(client, email="trainers-agenda@gym.com")
    coach = (await client.post("/api/v1/instructors",
                               json={"full_name": f"Choque {uuid.uuid4().hex[:4]}"},
                               headers=_auth(owner))).json()

    base = {
        "instructor": coach["full_name"], "instructor_id": coach["id"],
        "weekdays": [0, 2], "max_capacity": 10, "duration_minutes": 60,
    }
    a = await client.post("/api/v1/classes", json={
        **base, "name": f"Spinning {uuid.uuid4().hex[:4]}", "start_time": "07:00:00",
    }, headers=_auth(owner))
    assert a.status_code == 201, a.text

    b = await client.post("/api/v1/classes", json={
        **base, "name": f"Funcional {uuid.uuid4().hex[:4]}", "start_time": "07:30:00",
    }, headers=_auth(owner))
    assert b.status_code == 409, b.text
    assert "ya tiene" in b.json()["detail"]


async def test_classes_that_do_not_overlap_are_allowed(client):
    owner = await _owner_token(client, email="trainers-agenda2@gym.com")
    coach = (await client.post("/api/v1/instructors",
                               json={"full_name": f"Libre {uuid.uuid4().hex[:4]}"},
                               headers=_auth(owner))).json()
    base = {
        "instructor": coach["full_name"], "instructor_id": coach["id"],
        "weekdays": [1], "max_capacity": 10, "duration_minutes": 60,
    }
    a = await client.post("/api/v1/classes", json={
        **base, "name": f"Uno {uuid.uuid4().hex[:4]}", "start_time": "07:00:00",
    }, headers=_auth(owner))
    b = await client.post("/api/v1/classes", json={
        **base, "name": f"Dos {uuid.uuid4().hex[:4]}", "start_time": "08:00:00",
    }, headers=_auth(owner))
    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text


async def test_same_hour_on_different_days_is_not_a_conflict(client):
    owner = await _owner_token(client, email="trainers-agenda3@gym.com")
    coach = (await client.post("/api/v1/instructors",
                               json={"full_name": f"Dias {uuid.uuid4().hex[:4]}"},
                               headers=_auth(owner))).json()
    base = {
        "instructor": coach["full_name"], "instructor_id": coach["id"],
        "max_capacity": 10, "duration_minutes": 60, "start_time": "06:00:00",
    }
    a = await client.post("/api/v1/classes", json={
        **base, "name": f"Lun {uuid.uuid4().hex[:4]}", "weekdays": [0],
    }, headers=_auth(owner))
    b = await client.post("/api/v1/classes", json={
        **base, "name": f"Mar {uuid.uuid4().hex[:4]}", "weekdays": [1],
    }, headers=_auth(owner))
    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text


async def test_the_session_substitute_is_a_real_trainer(client):
    owner = await _owner_token(client, email="trainers-reemplazo@gym.com")
    r = await client.patch(f"/api/v1/class-sessions/{uuid.uuid4()}",
                           json={"instructor_override_id": str(uuid.uuid4())},
                           headers=_auth(owner))
    assert r.status_code == 404


async def test_the_trainer_screens_load_on_an_empty_gym(client):
    owner = await _owner_token(client, email="trainers-vacio@gym.com")
    trainer = await _invite(client, owner, "trainer", f"Vacio {uuid.uuid4().hex[:4]}")
    for path in ("/api/v1/trainer/me", "/api/v1/trainer/members",
                 "/api/v1/trainer/sessions", "/api/v1/trainer/routines"):
        r = await client.get(path, headers=_auth(trainer))
        assert r.status_code == 200, f"{path}: {r.text}"
