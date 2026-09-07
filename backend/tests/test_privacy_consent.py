"""Bloque 4: consentimiento de datos/imagen y medios privados firmados."""
import uuid

from app.services import storage as st
from tests.helpers import create_member, full_member_fields, create_plan

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="privacidad@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Privacidad", "gym_name": "Privacidad Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_media_resolver_public_private_and_legacy(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "s3_bucket", "fitconnect-media")
    monkeypatch.setattr(settings, "s3_endpoint_url", "http://minio:9000")
    monkeypatch.setattr(settings, "s3_public_url", "http://localhost:9000")
    monkeypatch.setattr(settings, "s3_access_key", "a")
    monkeypatch.setattr(settings, "s3_secret_key", "b")
    st._client = None
    st._public_client = None
    # Marca del gym: pública, sin firma
    assert st.resolve_media_url("gyms/g/logo.png") == "http://localhost:9000/fitconnect-media/gyms/g/logo.png"
    # Dato personal: firmado y apuntando al host público
    signed = st.resolve_media_url("members/g/x.jpg")
    assert signed.startswith("http://localhost:9000/") and "X-Amz-Signature" in signed
    # La firma se calculó contra el host público (SigV4 firma el Host)
    assert "minio:9000" not in signed
    # Scoping por tenant: una key de otro gym no se acepta como foto propia
    assert st.scoped_key("members/otro/x.jpg", "members/g/") is None
    assert st.scoped_key("http://localhost:9000/fitconnect-media/members/g/x.jpg?X-Amz-Signature=abc", "members/g/") == "members/g/x.jpg"
    assert st.scoped_key("https://cdn.example.com/a.png", "members/g/") == "https://cdn.example.com/a.png"
    # URL legada (foto guardada como URL pública) también se firma
    legacy = st.resolve_media_url("http://localhost:9000/fitconnect-media/members/g/x.jpg")
    assert "X-Amz-Signature" in legacy
    # URL externa pasa intacta
    assert st.resolve_media_url("https://cdn.example.com/a.png") == "https://cdn.example.com/a.png"
    assert st.key_from_url("https://otro.com/x.jpg") is None
    assert st.resolve_media_url(None) is None


async def test_member_create_requires_data_consent_and_records_it(client, monkeypatch):
    token = await _owner_token(client)
    h = _auth(token)
    plan_id = await create_plan(client, h)
    payload = full_member_fields()
    payload["plan_id"] = plan_id
    payload["consent_data"] = False
    r = await client.post("/api/v1/members", json=payload, headers=h)
    assert r.status_code == 422

    payload = full_member_fields()
    payload["plan_id"] = plan_id
    payload["consent_data"] = True
    payload["consent_image"] = True
    r = await client.post("/api/v1/members", json=payload, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["consent_data_at"] is not None and body["consent_image_at"] is not None

    # Revocar la imagen quita la foto (y la borra del bucket) y queda auditado
    async def fake_delete(value):
        return True
    monkeypatch.setattr("app.api.v1.members.delete_object", fake_delete)
    r = await client.post(f"/api/v1/members/{body['id']}/consent", json={"consent_image": False}, headers=h)
    assert r.status_code == 200 and r.json()["consent_image_at"] is None and r.json()["photo_url"] is None
    m = (await client.get(f"/api/v1/members/{body['id']}", headers=h)).json()
    assert m["consent_image_at"] is None and m["consent_data_at"] is not None


async def test_photo_key_is_signed_on_read(client, monkeypatch):
    token = await _owner_token(client)
    h = _auth(token)
    member = await create_member(client, h, full_name="Foto Privada")

    async def fake_upload(data, key, content_type):
        return key  # prefijo privado: se persiste la key

    monkeypatch.setattr("app.services.storage.upload_image", fake_upload)
    from app.core.config import settings
    monkeypatch.setattr(settings, "s3_bucket", "fitconnect-media")
    monkeypatch.setattr(settings, "s3_endpoint_url", "http://minio:9000")
    monkeypatch.setattr(settings, "s3_public_url", "http://localhost:9000")
    monkeypatch.setattr(settings, "s3_access_key", "a")
    monkeypatch.setattr(settings, "s3_secret_key", "b")
    st._client = None
    st._public_client = None
    # Sin autorización de imagen no se sube la foto
    r = await client.post(f"/api/v1/members/{member['id']}/photo", files={"file": ("f.jpg", b"\xff\xd8\xffdata", "image/jpeg")}, headers=h)
    assert r.status_code == 409
    r = await client.post(f"/api/v1/members/{member['id']}/consent", json={"consent_image": True}, headers=h)
    assert r.status_code == 200
    r = await client.post(f"/api/v1/members/{member['id']}/photo", files={"file": ("f.jpg", b"\xff\xd8\xffdata", "image/jpeg")}, headers=h)
    assert r.status_code == 200, r.text
    assert "X-Amz-Signature" in r.json()["photo_url"]
    m = (await client.get(f"/api/v1/members/{member['id']}", headers=h)).json()
    assert "X-Amz-Signature" in m["photo_url"] and m["consent_image_at"] is not None
    # Lo persistido es la key, no una URL pública
    listed = (await client.get("/api/v1/members", params={"id_number": member["id_number"]}, headers=h)).json()
    assert "X-Amz-Signature" in listed[0]["photo_url"]


def test_bucket_policy_only_exposes_brand_prefixes():
    """La política pública del bucket es el único punto donde un objeto queda
    legible sin firma. Este test la fija: si alguien agrega un prefijo con datos
    personales a PUBLIC_PREFIXES, o vuelve a abrir el bucket entero, falla aquí.

    Equivale a la comprobación manual contra MinIO (GET anónimo a members/ → 403)
    sin necesitar el contenedor levantado."""
    import json

    policy = json.loads(st._public_policy("fitconnect-media"))
    resources = policy["Statement"][0]["Resource"]
    assert policy["Statement"][0]["Action"] == ["s3:GetObject"], "la política pública solo debe permitir lectura"
    assert set(resources) == {
        "arn:aws:s3:::fitconnect-media/gyms/*",
        "arn:aws:s3:::fitconnect-media/exercises/*",
    }
    # Ningún prefijo con datos personales queda expuesto
    for personal in ("members/", "proofs/", "receipts/", "consents/", ""):
        assert f"arn:aws:s3:::fitconnect-media/{personal}*" not in resources
    # Y el bucket completo nunca se abre
    assert "arn:aws:s3:::fitconnect-media/*" not in resources
    assert st.is_public_key("gyms/g/logo.png") and st.is_public_key("exercises/x.jpg")
    assert not st.is_public_key("members/g/foto.webp")
    assert not st.is_public_key("proofs/g/comprobante.jpg")
