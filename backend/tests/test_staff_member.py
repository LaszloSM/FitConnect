"""El personal del gimnasio tambien entrena aqui.

Antes no habia ningun vinculo entre el equipo y `members`: un entrenador o un
recepcionista trabajaba en el gimnasio pero su huella, su QR y el torniquete no
lo reconocian. Ahora cada persona del equipo nace con su ficha de socio y una
membresia de cortesia, y entra por los mismos caminos que cualquiera.

Lo que NO puede pasar: que ensucien el negocio. El personal no paga, asi que
contarlo como socio infla el total, los nuevos del mes y el riesgo de abandono.
"""
import uuid
from urllib.parse import parse_qs, urlparse

from app.services.staff_member import STAFF_PLAN_NAME

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="staffsocio@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Dueña Staff", "gym_name": "Staff Socio Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _invite_and_accept(client, token, *, email, full_name, role="receptionist"):
    inv = await client.post("/api/v1/users/invite", json={
        "email": email, "full_name": full_name, "role": role,
    }, headers=_auth(token))
    assert inv.status_code == 201, inv.text
    invite_token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    acc = await client.post("/api/v1/auth/staff/accept-invite",
                            json={"token": invite_token, "password": "Staff12345!"})
    assert acc.status_code == 200, acc.text
    return acc.json()


async def _find_member(client, token, full_name):
    r = await client.get(f"/api/v1/members?search={full_name.split()[0]}&limit=100", headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    filas = body["items"] if isinstance(body, dict) else body
    return next((m for m in filas if m["full_name"] == full_name), None)


async def test_el_dueno_nace_con_su_ficha_de_socio(client):
    """Quien registra el gimnasio tambien entrena en el."""
    token = await _owner_token(client)
    ficha = await _find_member(client, token, "Dueña Staff")
    assert ficha is not None, "el dueño no tiene ficha de socio"
    assert ficha["member_type"] == "staff"
    assert ficha["qr_code"], "sin QR no puede entrar por el kiosko"


async def test_el_invitado_entra_al_gimnasio_al_aceptar(client):
    token = await _owner_token(client)
    correo = f"recep.{uuid.uuid4().hex[:6]}@gym.com"
    await _invite_and_accept(client, token, email=correo, full_name="Ana Recepción")

    ficha = await _find_member(client, token, "Ana Recepción")
    assert ficha is not None, "aceptar la invitación no creó la ficha de socio"
    assert ficha["member_type"] == "staff"

    # Lo que importa de verdad: puede cruzar la puerta.
    r = await client.post("/api/v1/checkins", json={"member_id": ficha["id"]}, headers=_auth(token))
    assert r.status_code == 201, r.text
    assert r.json()["decision"] == "allowed", r.text


async def test_la_cortesia_no_cobra_nada(client):
    token = await _owner_token(client)
    correo = f"entre.{uuid.uuid4().hex[:6]}@gym.com"
    await _invite_and_accept(client, token, email=correo, full_name="Beto Cortesía", role="trainer")
    ficha = await _find_member(client, token, "Beto Cortesía")

    r = await client.get(f"/api/v1/members/{ficha['id']}/memberships", headers=_auth(token))
    assert r.status_code == 200, r.text
    activas = [m for m in r.json() if m["status"] == "active"]
    assert activas, "el personal quedó sin membresía: no podría entrar"
    assert activas[0]["plan_name"] == STAFF_PLAN_NAME
    assert float(activas[0]["price"]) == 0.0


async def test_quitarle_el_acceso_al_software_le_quita_el_del_gimnasio(client):
    """Desvincular a alguien y que siga entrando por el torniquete es el caso grave."""
    token = await _owner_token(client)
    correo = f"salida.{uuid.uuid4().hex[:6]}@gym.com"
    await _invite_and_accept(client, token, email=correo, full_name="Caro Salida")
    ficha = await _find_member(client, token, "Caro Salida")

    usuarios = (await client.get("/api/v1/users", headers=_auth(token))).json()
    user_id = next(u["id"] for u in usuarios if u["email"] == correo)

    r = await client.delete(f"/api/v1/users/{user_id}", headers=_auth(token))
    assert r.status_code == 200, r.text

    r = await client.post("/api/v1/checkins", json={"member_id": ficha["id"]}, headers=_auth(token))
    assert r.json()["decision"] == "denied", "sigue entrando después de perder el acceso"

    # Y reactivarlo se lo devuelve.
    r = await client.post(f"/api/v1/users/{user_id}/reactivate", headers=_auth(token))
    assert r.status_code == 200, r.text

    membresias = (await client.get(f"/api/v1/members/{ficha['id']}/memberships",
                                   headers=_auth(token))).json()
    activas = [m for m in membresias if m["status"] == "active"]
    assert len(activas) == 1, "reactivar apiló una cortesía nueva en vez de reusar la cancelada"
    assert len(membresias) == 1, f"quedaron {len(membresias)} membresías de cortesía acumuladas"


async def test_un_id_que_no_es_uuid_no_revienta(client):
    """`user_id: str` dejaba pasar cualquier cosa y SQLAlchemy devolvía 500."""
    token = await _owner_token(client)
    r = await client.delete("/api/v1/users/12345", headers=_auth(token))
    assert r.status_code == 422, f"esperaba 422, llegó {r.status_code}: {r.text[:200]}"


async def test_un_entrenador_sin_cuenta_tambien_entra(client):
    """El profesor por horas no usa el software, pero tiene que cruzar la puerta."""
    token = await _owner_token(client)
    nombre = f"Dani Horas {uuid.uuid4().hex[:4]}"
    r = await client.post("/api/v1/instructors", json={"full_name": nombre, "specialty": "Spinning"},
                          headers=_auth(token))
    assert r.status_code == 201, r.text

    ficha = await _find_member(client, token, nombre)
    assert ficha is not None, "el entrenador sin cuenta no tiene ficha de socio"
    r = await client.post("/api/v1/checkins", json={"member_id": ficha["id"]}, headers=_auth(token))
    assert r.json()["decision"] == "allowed", r.text


async def test_el_personal_no_cuenta_como_socio_del_negocio(client):
    """No paga: contarlo infla el total de socios y los nuevos del mes."""
    token = await _owner_token(client)
    antes = (await client.get("/api/v1/dashboard/kpis", headers=_auth(token))).json()["kpis"]

    correo = f"kpi.{uuid.uuid4().hex[:6]}@gym.com"
    await _invite_and_accept(client, token, email=correo, full_name="Elsa KPI")

    despues = (await client.get("/api/v1/dashboard/kpis", headers=_auth(token))).json()["kpis"]
    assert despues["total_members"] == antes["total_members"], (
        "el personal se contó como socio del gimnasio"
    )
    assert despues["active_members"] == antes["active_members"]
    assert despues["new_members_this_month"] == antes["new_members_this_month"]
