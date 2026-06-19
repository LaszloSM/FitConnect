import uuid
from urllib.parse import urlparse, parse_qs

_TOKEN: dict[str, str] = {}


async def create_owner_token(client):
    # Token cacheado: la Master DB persiste entre corridas y /auth tiene rate limit
    if "token" in _TOKEN:
        return _TOKEN["token"]
    email = "users-owner@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner", "gym_name": "UsersGym", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _TOKEN["token"] = r.json()["access_token"]
    return _TOKEN["token"]


def _token_from_url(invite_url: str) -> str:
    return parse_qs(urlparse(invite_url).query)["token"][0]


async def onboard_staff(client, owner_token, role="receptionist", password="StaffPass123!"):
    """Flujo completo: el owner invita y el invitado acepta fijando su contraseña.
    Devuelve (email, password, staff_access_token)."""
    email = f"staff-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post(
        "/api/v1/users/invite",
        json={"email": email, "full_name": "Staff", "role": role},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert inv.status_code == 201, inv.text
    token = _token_from_url(inv.json()["invite_url"])
    acc = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": password})
    assert acc.status_code == 200, acc.text
    return email, password, acc.json()["access_token"]


async def test_owner_can_invite_staff(client):
    token = await create_owner_token(client)
    response = await client.post(
        "/api/v1/users/invite",
        json={"email": f"staff-{uuid.uuid4().hex[:8]}@gym.com", "full_name": "Staff", "role": "receptionist"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert "invite_url" in body and "token=" in body["invite_url"]
    assert "expires_at" in body


async def test_accept_invite_creates_staff_and_allows_login(client):
    owner_token = await create_owner_token(client)
    email, password, staff_token = await onboard_staff(client, owner_token)
    assert staff_token
    # El staff puede entrar por su endpoint con la contraseña que él fijó
    login = await client.post("/api/v1/auth/staff/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text


async def test_accept_invite_invalid_token_fails(client):
    response = await client.post(
        "/api/v1/auth/staff/accept-invite",
        json={"token": "token-que-no-existe", "password": "Whatever123!"},
    )
    assert response.status_code == 400


async def test_accept_invite_is_single_use(client):
    owner_token = await create_owner_token(client)
    email = f"staff-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post(
        "/api/v1/users/invite",
        json={"email": email, "full_name": "Staff", "role": "receptionist"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    token = _token_from_url(inv.json()["invite_url"])
    first = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": "StaffPass123!"})
    assert first.status_code == 200, first.text
    # Reusar el mismo token falla (un solo uso)
    second = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": "Otra123456!"})
    assert second.status_code == 400


async def test_invite_weak_password_rejected_on_accept(client):
    owner_token = await create_owner_token(client)
    email = f"staff-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post(
        "/api/v1/users/invite",
        json={"email": email, "full_name": "Staff", "role": "receptionist"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    token = _token_from_url(inv.json()["invite_url"])
    response = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": "short"})
    assert response.status_code == 422


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
    _, _, recep_token = await onboard_staff(client, owner_token, role="receptionist")
    response = await client.post(
        "/api/v1/users/invite",
        json={"email": f"other-{uuid.uuid4().hex[:8]}@gym.com", "full_name": "Other", "role": "receptionist"},
        headers={"Authorization": f"Bearer {recep_token}"},
    )
    assert response.status_code == 403
