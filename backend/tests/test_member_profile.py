"""Completar la ficha del socio por enlace: qué falta, envío por WhatsApp/correo,
página pública que solo llena vacíos, un solo uso y envío masivo."""
import re
import uuid

from app.services import mailer
from tests.helpers import create_plan
from tests.test_users import create_owner_token


def _h(token):
    return {"Authorization": f"Bearer {token}"}


async def _imported_member(client, token, **extra) -> str:
    """Socio como llega del software anterior: nombre, cédula y poco más."""
    cedula = extra.get("cedula") or str(uuid.uuid4().int)[:9]
    r = await client.post("/api/v1/members/import/commit", headers=_h(token), files={
        "file": ("socios.csv", (
            "Cédula;Nombre;Teléfono;Email\n"
            f"{cedula};ANA PEREZ;{extra.get('phone', '')};{extra.get('email', '')}\n"
        ).encode("utf-8"), "text/csv"),
    })
    assert r.status_code == 200, r.text
    found = await client.get("/api/v1/members", params={"id_number": cedula}, headers=_h(token))
    return found.json()[0]["id"]


async def test_status_lists_what_is_missing_and_filter_finds_it(client):
    token = await create_owner_token(client)
    cedula = str(uuid.uuid4().int)[:9]
    mid = await _imported_member(client, token, cedula=cedula, phone="3001234567")
    st = (await client.get(f"/api/v1/members/{mid}/profile-status", headers=_h(token))).json()
    assert st["complete"] is False
    assert {"birth_date", "emergency_contact", "parq", "consent_data"} <= set(st["missing"])
    assert "phone" not in st["missing"] and "id_number" not in st["missing"]
    ids = [m["id"] for m in (await client.get("/api/v1/members", params={"incomplete": True, "q": cedula},
                                              headers=_h(token))).json()]
    assert mid in ids


async def test_whatsapp_link_fills_only_empty_fields_and_is_single_use(client):
    token = await create_owner_token(client)
    vieja = f"ana.vieja.{uuid.uuid4().hex[:6]}@correo.com"
    mid = await _imported_member(client, token, phone="3001234567", email=vieja)
    r = await client.post(f"/api/v1/members/{mid}/profile-link", json={"channel": "whatsapp"}, headers=_h(token))
    assert r.status_code == 200, r.text
    assert r.json()["sent"] is True
    url = r.json()["url"]
    slug, link_token = re.search(r"/completar/([^/]+)/([\w-]+)$", url).groups()

    page = await client.get(f"/api/v1/public/profile/{slug}/{link_token}")
    assert page.status_code == 200, page.text
    body = page.json()
    assert body["first_name"] == "Ana" and "parq" in body["missing"]
    # No devuelve datos personales que ya tiene la ficha.
    assert "3001234567" not in page.text and "ana.vieja" not in page.text

    no_consent = await client.post(f"/api/v1/public/profile/{slug}/{link_token}", json={"birth_date": "1990-04-02"})
    assert no_consent.status_code == 422

    parq = {f"q{i}": False for i in range(1, 8)}
    sent = await client.post(f"/api/v1/public/profile/{slug}/{link_token}", json={
        "birth_date": "1990-04-02",
        "email": "otra@correo.com",          # ya tenía correo: no se pisa
        "phone": "3119998877",               # ya tenía celular: no se pisa
        "emergency_contact_name": "Luis Pérez",
        "emergency_contact_phone": "310 555 1234",
        "blood_type": "o+",
        "parq_answers": parq,
        "accept_data": True,
    })
    assert sent.status_code == 200, sent.text
    assert sent.json()["complete"] is True
    assert "email" not in sent.json()["filled"] and "phone" not in sent.json()["filled"]

    member = (await client.get(f"/api/v1/members/{mid}", headers=_h(token))).json()
    assert member["email"] == vieja and member["phone"] == "+573001234567"
    assert member["emergency_contact_phone"] == "+573105551234" and member["blood_type"] == "O+"
    assert member["birth_date"] == "1990-04-02"

    again = await client.post(f"/api/v1/public/profile/{slug}/{link_token}", json={"accept_data": True})
    assert again.status_code == 404
    assert (await client.get(f"/api/v1/public/profile/{slug}/{link_token}")).status_code == 404

    st = (await client.get(f"/api/v1/members/{mid}/profile-status", headers=_h(token))).json()
    assert st["complete"] is True and st["last_link"]["used_at"] is not None

    audit = (await client.get("/api/v1/audit", params={"entity_id": mid}, headers=_h(token)))
    if audit.status_code == 200:
        assert any(a.get("action") == "member.profile_self_update" for a in audit.json().get("items", audit.json()))


async def test_new_link_invalidates_previous_and_other_gym_cannot_open_it(client):
    token = await create_owner_token(client)
    mid = await _imported_member(client, token)
    first = (await client.post(f"/api/v1/members/{mid}/profile-link", json={"channel": "copy"}, headers=_h(token))).json()
    second = (await client.post(f"/api/v1/members/{mid}/profile-link", json={"channel": "copy"}, headers=_h(token))).json()
    s1, t1 = re.search(r"/completar/([^/]+)/([\w-]+)$", first["url"]).groups()
    s2, t2 = re.search(r"/completar/([^/]+)/([\w-]+)$", second["url"]).groups()
    assert (await client.get(f"/api/v1/public/profile/{s1}/{t1}")).status_code == 404
    assert (await client.get(f"/api/v1/public/profile/{s2}/{t2}")).status_code == 200
    assert (await client.get(f"/api/v1/public/profile/otro-gym-{uuid.uuid4().hex[:4]}/{t2}")).status_code == 404


async def test_channel_without_contact_is_refused(client):
    token = await create_owner_token(client)
    mid = await _imported_member(client, token)
    r = await client.post(f"/api/v1/members/{mid}/profile-link", json={"channel": "email"}, headers=_h(token))
    assert r.status_code == 409 and "correo" in r.json()["detail"]


async def test_email_bulk_skips_recent_and_complete_members(client):
    token = await create_owner_token(client)
    tag = uuid.uuid4().hex[:6]
    await _imported_member(client, token, email=f"bulk-{tag}@correo.com")
    await create_plan(client, _h(token))
    mailer.OUTBOX.clear()
    r = await client.post("/api/v1/members/profile-links/bulk", json={"channel": "email", "limit": 300}, headers=_h(token))
    assert r.status_code == 200, r.text
    assert any(m.to == f"bulk-{tag}@correo.com" for m in mailer.OUTBOX)
    mailer.OUTBOX.clear()
    again = await client.post("/api/v1/members/profile-links/bulk", json={"channel": "email", "limit": 300}, headers=_h(token))
    assert not any(m.to == f"bulk-{tag}@correo.com" for m in mailer.OUTBOX), "no se reenvía en 3 días"
    assert again.json()["incomplete_total"] >= 1


async def test_document_already_taken_is_refused(client):
    token = await create_owner_token(client)
    taken = str(uuid.uuid4().int)[:9]
    await _imported_member(client, token, cedula=taken)
    # Socio sin documento (como entra un importado "sin cédula").
    name = f"PEDRO SIN DOC {uuid.uuid4().hex[:6].upper()}"
    r = await client.post("/api/v1/members/import/commit", headers=_h(token), files={
        "file": ("s.csv", f"Nombre;Teléfono\n{name};3007778899\n".encode(), "text/csv")})
    assert r.status_code == 200, r.text
    pedro = (await client.get("/api/v1/members", params={"q": name}, headers=_h(token))).json()[0]["id"]
    link = (await client.post(f"/api/v1/members/{pedro}/profile-link", json={"channel": "copy"}, headers=_h(token))).json()
    slug, tok = re.search(r"/completar/([^/]+)/([\w-]+)$", link["url"]).groups()
    r = await client.post(f"/api/v1/public/profile/{slug}/{tok}", json={"id_number": taken, "accept_data": True})
    assert r.status_code == 409


async def test_member_can_add_photo_once_through_the_link(client):
    token = await create_owner_token(client)
    mid = await _imported_member(client, token)
    link = (await client.post(f"/api/v1/members/{mid}/profile-link", json={"channel": "copy"}, headers=_h(token))).json()
    slug, tok = re.search(r"/completar/([^/]+)/([\w-]+)$", link["url"]).groups()
    jpeg = b"\xff\xd8\xff\xe0" + b"0" * 2000 + b"\xff\xd9"
    bad = await client.post(f"/api/v1/public/profile/{slug}/{tok}/photo", files={"file": ("a.gif", b"GIF89a", "image/gif")})
    assert bad.status_code == 400
    ok = await client.post(f"/api/v1/public/profile/{slug}/{tok}/photo", files={"file": ("yo.jpg", jpeg, "image/jpeg")})
    assert ok.status_code == 200, ok.text
    twice = await client.post(f"/api/v1/public/profile/{slug}/{tok}/photo", files={"file": ("yo.jpg", jpeg, "image/jpeg")})
    assert twice.status_code == 409
    member = (await client.get(f"/api/v1/members/{mid}", headers=_h(token))).json()
    assert member["photo_url"] and member["consent_image_at"]


async def test_profile_summary_counts_incomplete(client):
    token = await create_owner_token(client)
    await _imported_member(client, token, phone="3005556677")
    r = await client.get("/api/v1/members/profile-summary", headers=_h(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["incomplete"] >= 1 and body["with_phone"] >= 1
