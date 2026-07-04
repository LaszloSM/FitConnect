import uuid


def _payload(email):
    return {
        "email": email,
        "password": "SecurePass123!",
        "full_name": "Ana Onboarding",
        "gym_name": "Gym Onboarding Test",
        "city": "Medellín",
    }


async def _register_and_login(client):
    email = f"onb-{uuid.uuid4().hex[:8]}@gym.com"
    await client.post("/api/v1/auth/register", json=_payload(email))
    login = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "SecurePass123!",
    })
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_onboarding_status_requires_auth(client):
    response = await client.get("/api/v1/onboarding/status")
    assert response.status_code in (401, 403)


async def test_onboarding_status_fresh_tenant(client):
    headers = await _register_and_login(client)
    response = await client.get("/api/v1/onboarding/status", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    # Contrato exacto que consume OnboardingChecklist.tsx
    assert set(data.keys()) == {"has_plan", "has_member", "done"}
    assert data == {"has_plan": False, "has_member": False, "done": False}


async def test_onboarding_done_after_plan_and_member(client):
    headers = await _register_and_login(client)

    plan = await client.post("/api/v1/member-plans/", headers=headers, json={
        "name": "Mensual",
        "price": 80000,
        "duration_days": 30,
    })
    assert plan.status_code in (200, 201), plan.text

    member = await client.post("/api/v1/members", headers=headers, json={
        "full_name": "Socio Onboarding",
        "email": f"socio-{uuid.uuid4().hex[:8]}@test.co",
        "id_type": "CC",
        "id_number": uuid.uuid4().hex[:10],
    })
    assert member.status_code in (200, 201), member.text

    response = await client.get("/api/v1/onboarding/status", headers=headers)
    data = response.json()
    assert data == {"has_plan": True, "has_member": True, "done": True}
