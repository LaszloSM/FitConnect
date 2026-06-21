import uuid
from urllib.parse import urlparse, parse_qs

import pytest

_OWNER: dict[str, str] = {}


async def _owner_token(client):
    if "token" in _OWNER:
        return _OWNER["token"]
    email = "rbac-owner@gym.com"
    await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner RBAC", "gym_name": "RbacGym", "city": "Riohacha",
    })
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    _OWNER["token"] = r.json()["access_token"]
    return _OWNER["token"]


async def _staff_token(client, owner_token, role):
    """Invita y acepta para obtener un token de staff con el rol dado."""
    email = f"{role}-{uuid.uuid4().hex[:8]}@gym.com"
    inv = await client.post(
        "/api/v1/users/invite",
        json={"email": email, "full_name": role.title(), "role": role},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    token = parse_qs(urlparse(inv.json()["invite_url"]).query)["token"][0]
    acc = await client.post("/api/v1/auth/staff/accept-invite", json={"token": token, "password": "StaffPass123!"})
    return acc.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# Endpoints restringidos a owner+admin (visibilidad financiera)
FINANCIAL_GET = [
    "/api/v1/dashboard/kpis",
    "/api/v1/dashboard/insights",
    "/api/v1/dashboard/operations",
    "/api/v1/payments",
    "/api/v1/payments/cash",
    "/api/v1/payments/receivables",
    "/api/v1/settings/billing",
    "/api/v1/reports/member-status",
    "/api/v1/reports/payment-methods",
    "/api/v1/cash/shifts",
    "/api/v1/cash/expenses",
]


@pytest.mark.parametrize("path", FINANCIAL_GET)
async def test_receptionist_forbidden_on_financial(client, path):
    owner = await _owner_token(client)
    recep = await _staff_token(client, owner, "receptionist")
    r = await client.get(path, headers=_auth(recep))
    assert r.status_code == 403, f"{path} debería ser 403 para recepción, fue {r.status_code}"


@pytest.mark.parametrize("path", FINANCIAL_GET)
async def test_admin_allowed_on_financial(client, path):
    owner = await _owner_token(client)
    admin = await _staff_token(client, owner, "admin")
    r = await client.get(path, headers=_auth(admin))
    assert r.status_code == 200, f"{path} debería ser 200 para admin, fue {r.status_code} ({r.text})"


async def test_receptionist_allowed_on_operational(client):
    owner = await _owner_token(client)
    recep = await _staff_token(client, owner, "receptionist")
    # Recepción sí puede operar: ver miembros y check-ins del día
    assert (await client.get("/api/v1/members", headers=_auth(recep))).status_code == 200
    assert (await client.get("/api/v1/checkins/today", headers=_auth(recep))).status_code == 200


async def test_receptionist_cannot_delete_member(client):
    owner = await _owner_token(client)
    recep = await _staff_token(client, owner, "receptionist")
    r = await client.delete(f"/api/v1/members/{uuid.uuid4()}", headers=_auth(recep))
    assert r.status_code == 403
