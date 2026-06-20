import uuid

_TOKEN: dict[str, str] = {}


async def _owner_token(client):
    if "t" in _TOKEN:
        return _TOKEN["t"]
    email = f"rt-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner RT", "gym_name": "RTGym", "city": "Bogotá",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKEN["t"] = r.json()["access_token"]
    return _TOKEN["t"]


async def test_realtime_token_issued_for_staff(client):
    token = await _owner_token(client)
    r = await client.post("/api/v1/realtime/token", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json()["token"]


async def test_realtime_token_requires_auth(client):
    r = await client.post("/api/v1/realtime/token")
    assert r.status_code in (401, 403)


async def test_reception_rejects_non_realtime_token(client):
    token = await _owner_token(client)
    # El token de sesión normal no tiene scope=realtime → la conexión SSE lo rechaza
    r = await client.get(f"/api/v1/realtime/reception?token={token}")
    assert r.status_code == 401


async def test_reception_rejects_garbage_token(client):
    r = await client.get("/api/v1/realtime/reception?token=basura")
    assert r.status_code == 401
