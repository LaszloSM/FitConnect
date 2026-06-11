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


async def test_login_wrong_password_fails(client):
    email = f"wrong-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json=_payload(email))
    response = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "WrongPassword",
    })
    assert response.status_code == 401
