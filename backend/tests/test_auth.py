import uuid


def _payload(email):
    return {
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Carlos Pérez",
        "gym_name": "FitPlace Riohacha",
        "city": "Riohacha",
    }


async def test_register_gym_owner(client):
    # Email único: la Master DB persiste entre corridas de la suite
    email = f"owner-{uuid.uuid4().hex[:8]}@gym.com"
    response = await client.post("/api/v1/auth/register", json=_payload(email))
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["email"] == email
    assert data["role"] == "owner"


async def test_register_duplicate_email_fails(client):
    email = f"dup-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json=_payload(email))
    response = await client.post("/api/v1/auth/register", json=_payload(email))
    assert response.status_code == 400


async def test_login_returns_token(client):
    email = f"login-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json=_payload(email))
    response = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "SecurePass123!",
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "owner"


async def test_register_persists_phone_normalized(client):
    email = f"phone-{uuid.uuid4().hex[:8]}@gym.com"
    payload = _payload(email) | {"phone": "300 111 2233"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text

    login = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "SecurePass123!",
    })
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    settings = await client.get("/api/v1/settings/gym", headers=headers)
    assert settings.status_code == 200, settings.text
    assert settings.json()["phone"] == "+573001112233"


async def test_register_phone_too_long_rejected(client):
    email = f"phonelong-{uuid.uuid4().hex[:8]}@gym.com"
    payload = _payload(email) | {"phone": "3" * 60}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


async def test_register_with_honeypot_filled_creates_nothing(client):
    email = f"bot-{uuid.uuid4().hex[:8]}@gym.com"
    payload = _payload(email) | {"website": "https://spam.example"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 400

    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "SecurePass123!"})
    assert login.status_code == 401


async def test_login_wrong_password_fails(client):
    email = f"wrong-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json=_payload(email))
    response = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "WrongPassword",
    })
    assert response.status_code == 401


async def test_refresh_issues_new_working_token(client):
    """La renovación silenciosa: el token nuevo sirve y conserva la identidad."""
    email = f"refresh-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json=_payload(email))
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "SecurePass123!"})
    old = login.json()
    h = {"Authorization": f"Bearer {old['access_token']}"}

    r = await client.post("/api/v1/auth/refresh", headers=h)
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["access_token"] != old["access_token"]
    assert new["role"] == old["role"] == "owner"
    assert new["tenant_id"] == old["tenant_id"]
    assert new["db_name"] == old["db_name"]
    assert new["full_name"] == old["full_name"]

    # El token nuevo abre un endpoint protegido de la misma tenant DB
    me = await client.get("/api/v1/members", headers={"Authorization": f"Bearer {new['access_token']}"})
    assert me.status_code == 200, me.text


async def test_refresh_rejects_invalid_and_missing_token(client):
    assert (await client.post("/api/v1/auth/refresh")).status_code == 403
    bad = {"Authorization": "Bearer no-es-un-token"}
    assert (await client.post("/api/v1/auth/refresh", headers=bad)).status_code == 401
