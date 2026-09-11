"""Mensajería: el texto que el dueño edita tiene que llegar de verdad.

Antes el editor era teatro: el cuerpo editable solo lo leían cumpleaños y
win-back, así que en 4 de las 6 ocasiones el dueño escribía un mensaje, lo
guardaba, veía un badge de "Aprobado" imposible... y el socio recibía otra cosa.
"""
import uuid

import pytest

from tests.helpers import create_member, create_member_without_membership, create_plan

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="msg@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Mensajes", "gym_name": "Mensajes Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKENS[email] = r.json()["access_token"]
    return _TOKENS[email]


def _auth(token, key=None):
    h = {"Authorization": f"Bearer {token}"}
    if key:
        h["Idempotency-Key"] = key
    return h


async def _notifications(client, token):
    return (await client.get("/api/v1/notifications?limit=100", headers=_auth(token))).json()


# ─────────────────────────── El catálogo ───────────────────────────

async def test_catalog_has_no_ghost_occasions(client):
    """Cada ocasión que se puede editar tiene que tener un emisor detrás."""
    token = await _owner_token(client)
    rows = (await client.get("/api/v1/messages", headers=_auth(token))).json()
    keys = {r["occasion"] for r in rows}
    assert "welcome" in keys, "la bienvenida se podía editar y no la emitía nadie"
    assert "announcement" not in keys, "los anuncios no son un mensaje automático"
    for r in rows:
        assert r["variables"], f"{r['occasion']} sin variables"
        assert "meta_status" not in r, "el ciclo de aprobación de Meta no existe en esta app"


async def test_edited_body_reaches_the_member(client):
    """La prueba del delito: se edita el texto y ese texto es el que llega."""
    token = await _owner_token(client)
    marca = uuid.uuid4().hex[:8]
    r = await client.put("/api/v1/messages/welcome", json={
        "body": f"Bienvenido {{nombre}} — {marca}",
        "is_active": True,
        "meta_template_name": "bienvenida",
    }, headers=_auth(token))
    assert r.status_code == 200, r.text

    member = await create_member(client, _auth(token), full_name="Ana Prueba")
    notifs = await _notifications(client, token)
    mios = [n for n in notifs if n.get("member_id") == member["id"]]
    assert mios, "el alta no generó ninguna notificación"
    assert any(marca in n["message"] for n in mios), (
        f"el texto editado no llegó: {[n['message'] for n in mios]}"
    )
    assert any("Ana" in n["message"] for n in mios), "la variable {nombre} no se reemplazó"


async def test_turning_an_occasion_off_silences_it(client):
    """El interruptor existía en el modelo y la UI nunca lo expuso."""
    token = await _owner_token(client, email="msg-off@gym.com")
    await client.put("/api/v1/messages/welcome", json={
        "body": "Hola {nombre}", "is_active": False, "meta_template_name": None,
    }, headers=_auth(token))

    member = await create_member(client, _auth(token), full_name="Sin Aviso")
    notifs = await _notifications(client, token)
    welcome = [
        n for n in notifs
        if n.get("member_id") == member["id"] and n["type"] == "member.welcome"
    ]
    assert welcome == [], "la ocasión apagada siguió notificando"


async def test_unknown_occasion_is_rejected(client):
    token = await _owner_token(client)
    r = await client.put("/api/v1/messages/inventada", json={
        "body": "x", "is_active": True, "meta_template_name": None,
    }, headers=_auth(token))
    assert r.status_code == 404


async def test_preview_replaces_every_variable(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/messages/membership_expiring/preview", json={
        "body": "Hola {nombre}, tu {plan} vence el {fecha}: {link}",
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    preview = r.json()["preview"]
    assert "{" not in preview, f"quedó una variable sin reemplazar: {preview}"


# ─────────────────────────── Anuncios ───────────────────────────

async def test_audience_is_known_before_sending(client):
    """Enviar a ciegas a todo el gym es de las pocas cosas que no se deshacen."""
    token = await _owner_token(client, email="msg-ann@gym.com")
    plan_id = await create_plan(client, _auth(token), duration_days=30)
    for i in range(3):
        await create_member(client, _auth(token), plan_id=plan_id, full_name=f"Socio {i}")

    r = await client.post("/api/v1/messages/announcements/audience", json={
        "segment": "with_membership",
    }, headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 3
    assert body["with_phone"] + body["without_phone"] == body["total"]
    assert len(body["sample"]) <= 10


async def test_unknown_segment_is_rejected(client):
    token = await _owner_token(client, email="msg-ann@gym.com")
    r = await client.post("/api/v1/messages/announcements/audience", json={
        "segment": "los_que_me_caen_bien",
    }, headers=_auth(token))
    assert r.status_code == 400


async def test_announcement_reaches_the_whole_segment(client):
    token = await _owner_token(client, email="msg-ann2@gym.com")
    plan_id = await create_plan(client, _auth(token), duration_days=30)
    miembros = [
        await create_member(client, _auth(token), plan_id=plan_id, full_name=f"Aviso {i}")
        for i in range(3)
    ]

    marca = uuid.uuid4().hex[:8]
    r = await client.post("/api/v1/messages/announcements", json={
        "title": "Festivo",
        "body": f"Hola {{nombre}}, el lunes abrimos hasta las 2pm. {marca}",
        "segment": "with_membership",
    }, headers=_auth(token, uuid.uuid4().hex))
    assert r.status_code == 201, r.text
    assert r.json()["recipients"] >= 3

    notifs = await _notifications(client, token)
    con_marca = [n for n in notifs if marca in n["message"]]
    ids = {n["member_id"] for n in con_marca}
    for m in miembros:
        assert m["id"] in ids, f"{m['full_name']} no recibió el anuncio"
    # El {nombre} se personaliza por socio, no queda el literal
    assert all("{nombre}" not in n["message"] for n in con_marca)


async def test_double_click_does_not_send_the_announcement_twice(client):
    """Mandar el mismo anuncio dos veces a todo el gym no se puede deshacer."""
    token = await _owner_token(client, email="msg-ann3@gym.com")
    plan_id = await create_plan(client, _auth(token), duration_days=30)
    await create_member(client, _auth(token), plan_id=plan_id, full_name="Doble Clic")

    key = uuid.uuid4().hex
    body = {"title": "Aviso", "body": "Mensaje único", "segment": "with_membership"}
    a = await client.post("/api/v1/messages/announcements", json=body, headers=_auth(token, key))
    b = await client.post("/api/v1/messages/announcements", json=body, headers=_auth(token, key))
    assert a.status_code == 201, a.text
    assert b.status_code == 201
    assert a.json()["id"] == b.json()["id"], "el reintento creó un anuncio nuevo"

    listed = (await client.get("/api/v1/messages/announcements", headers=_auth(token))).json()
    assert len([x for x in listed if x["id"] == a.json()["id"]]) == 1


async def test_empty_segment_is_rejected(client):
    token = await _owner_token(client, email="msg-vacio@gym.com")
    r = await client.post("/api/v1/messages/announcements", json={
        "title": "A nadie", "body": "Mensaje", "segment": "inactive",
    }, headers=_auth(token, uuid.uuid4().hex))
    assert r.status_code == 400
    assert "segmento" in r.json()["detail"].lower()


# ─────────────────────────── Mensaje a un socio ───────────────────────────

async def test_direct_message_to_one_member(client):
    token = await _owner_token(client, email="msg-directo@gym.com")
    member = await create_member_without_membership(client, _auth(token), full_name="Solo Uno")
    marca = uuid.uuid4().hex[:8]

    r = await client.post("/api/v1/messages/send", json={
        "member_id": member["id"], "title": "Recordatorio", "body": f"Hola {{nombre}} {marca}",
    }, headers=_auth(token, uuid.uuid4().hex))
    assert r.status_code == 201, r.text

    notifs = await _notifications(client, token)
    mios = [n for n in notifs if marca in n["message"]]
    assert len(mios) == 1
    assert mios[0]["member_id"] == member["id"]
    assert "Solo" in mios[0]["message"]


async def test_direct_message_to_unknown_member_is_404(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/messages/send", json={
        "member_id": str(uuid.uuid4()), "title": "Hola", "body": "Mensaje",
    }, headers=_auth(token, uuid.uuid4().hex))
    assert r.status_code == 404


# ─────────────────────────── Envíos ───────────────────────────

async def test_outbox_is_visible(client):
    """El endpoint existía desde hacía meses y ninguna pantalla lo consumía."""
    token = await _owner_token(client)
    r = await client.get("/api/v1/messages/outbox", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


async def test_retry_only_applies_to_failed_or_skipped(client):
    token = await _owner_token(client)
    r = await client.post(f"/api/v1/messages/outbox/{uuid.uuid4()}/retry", headers=_auth(token))
    assert r.status_code == 404


@pytest.mark.parametrize("path", [
    "/api/v1/messages",
    "/api/v1/messages/segments",
    "/api/v1/messages/announcements",
    "/api/v1/messages/outbox",
])
async def test_messaging_screens_load_on_an_empty_gym(client, path):
    """Un gym recién creado es lo primero que ve un cliente nuevo."""
    token = await _owner_token(client, email="msg-vacio2@gym.com")
    r = await client.get(path, headers=_auth(token))
    assert r.status_code == 200, r.text
