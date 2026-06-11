import uuid

_TOKEN: dict[str, str] = {}


async def create_owner_token(client):
    # Token cacheado: la Master DB persiste entre corridas y /auth tiene rate limit
    if "token" in _TOKEN:
        return _TOKEN["token"]
    # Email propio de este archivo: owner@gym.com existe en la Master DB
    # persistente con otra contraseña (lo registró el viejo test_auth)
    email = "users-owner@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner", "gym_name": "UsersGym", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKEN["token"] = r.json()["access_token"]
    return _TOKEN["token"]


async def test_owner_can_invite_staff(client):
    token = await create_owner_token(client)
    response = await client.post(
        "/api/v1/users/invite",
        json={"email": f"staff-{uuid.uuid4().hex[:8]}@gym.com", "full_name": "Staff", "role": "receptionist"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201, response.text


async def test_list_staff_only_shows_same_tenant(client):
    token = await create_owner_token(client)
    response = await client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    users = response.json()
    assert all(u["role"] in ["owner", "admin", "receptionist"] for u in users)


async def test_receptionist_cannot_invite_staff(client):
    owner_token = await create_owner_token(client)
    recep_email = f"recep-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post(
        "/api/v1/users/invite",
        json={"email": recep_email, "full_name": "Recep", "role": "receptionist"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    # El staff entra por /auth/staff/login (no /auth/login, que es de owners)
    r = await client.post("/api/v1/auth/staff/login", json={"email": recep_email, "password": "TempPass123!"})
    recep_token = r.json()["access_token"]
    response = await client.post(
        "/api/v1/users/invite",
        json={"email": f"other-{uuid.uuid4().hex[:8]}@gym.com", "full_name": "Other", "role": "receptionist"},
        headers={"Authorization": f"Bearer {recep_token}"},
    )
    assert response.status_code == 403
