import uuid

_TOKENS: dict[str, str] = {}


async def _owner_token(client, email="cedula@gym.com"):
    if email in _TOKENS:
        return _TOKENS[email]
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Cedula", "gym_name": "Cedula Gym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    token = r.json()["access_token"]
    _TOKENS[email] = token
    return token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _member_payload(id_number=None):
    return {
        "full_name": "Miembro Cedula",
        "email": f"c-{uuid.uuid4().hex[:10]}@test.com",
        "id_type": "CC",
        "id_number": id_number or str(uuid.uuid4().int)[:10],
    }


async def test_create_without_cedula_is_422(client):
    token = await _owner_token(client)
    payload = _member_payload()
    del payload["id_number"]
    del payload["id_type"]
    r = await client.post("/api/v1/members", json=payload, headers=_auth(token))
    assert r.status_code == 422


async def test_duplicate_cedula_is_409(client):
    token = await _owner_token(client)
    cedula = str(uuid.uuid4().int)[:10]
    r1 = await client.post("/api/v1/members", json=_member_payload(cedula), headers=_auth(token))
    assert r1.status_code == 201, r1.text
    r2 = await client.post("/api/v1/members", json=_member_payload(cedula), headers=_auth(token))
    assert r2.status_code == 409
    assert "ya está registrada" in r2.json()["detail"]


async def test_update_to_duplicate_cedula_is_409(client):
    token = await _owner_token(client)
    cedula_a = str(uuid.uuid4().int)[:10]
    a = await client.post("/api/v1/members", json=_member_payload(cedula_a), headers=_auth(token))
    b = await client.post("/api/v1/members", json=_member_payload(), headers=_auth(token))
    r = await client.put(
        f"/api/v1/members/{b.json()['id']}",
        json={"id_number": cedula_a},
        headers=_auth(token),
    )
    assert r.status_code == 409
    assert a.json()["full_name"] in r.json()["detail"]


async def test_search_by_cedula(client):
    token = await _owner_token(client)
    cedula = str(uuid.uuid4().int)[:10]
    created = await client.post("/api/v1/members", json=_member_payload(cedula), headers=_auth(token))
    r = await client.get("/api/v1/members", params={"q": cedula}, headers=_auth(token))
    assert r.status_code == 200
    ids = [m["id"] for m in r.json()]
    assert created.json()["id"] in ids


async def test_payments_include_member_name(client):
    token = await _owner_token(client)
    member = await client.post("/api/v1/members", json=_member_payload(), headers=_auth(token))
    member_id = member.json()["id"]
    pay = await client.post("/api/v1/payments", json={
        "member_id": member_id, "amount": 50000, "method": "transfer",
        "status": "paid", "concept": "Mensualidad",
    }, headers=_auth(token))
    assert pay.status_code == 201, pay.text
    assert pay.json()["member_name"] == "Miembro Cedula"
    listing = await client.get("/api/v1/payments", params={"member_id": member_id}, headers=_auth(token))
    assert listing.json()[0]["member_name"] == "Miembro Cedula"
