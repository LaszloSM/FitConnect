async def test_register_gym_owner(client):
    response = await client.post("/api/v1/auth/register", json={
        "email": "owner@gym.com",
        "password": "SecurePass123!",
        "full_name": "Carlos Pérez",
        "gym_name": "FitPlace Riohacha",
        "city": "Riohacha",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "owner@gym.com"
    assert data["role"] == "owner"


async def test_register_duplicate_email_fails(client):
    payload = {
        "email": "owner@gym.com",
        "password": "SecurePass123!",
        "full_name": "Carlos Pérez",
        "gym_name": "FitPlace",
        "city": "Riohacha",
    }
    await client.post("/api/v1/auth/register", json=payload)
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 400


async def test_login_returns_token(client):
    await client.post("/api/v1/auth/register", json={
        "email": "owner@gym.com",
        "password": "SecurePass123!",
        "full_name": "Carlos Pérez",
        "gym_name": "FitPlace",
        "city": "Riohacha",
    })
    response = await client.post("/api/v1/auth/login", json={
        "email": "owner@gym.com",
        "password": "SecurePass123!",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "owner"


async def test_login_wrong_password_fails(client):
    await client.post("/api/v1/auth/register", json={
        "email": "owner@gym.com",
        "password": "SecurePass123!",
        "full_name": "Carlos",
        "gym_name": "FitPlace",
        "city": "Riohacha",
    })
    response = await client.post("/api/v1/auth/login", json={
        "email": "owner@gym.com",
        "password": "WrongPassword",
    })
    assert response.status_code == 401
