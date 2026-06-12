"""
Verifies that tenant A cannot see data from tenant B.
Requires the test DB to be running.
"""
import uuid


async def test_tenant_data_isolation(client):
    """
    Register two separate tenants (GymA and GymB), create a member in GymA,
    and verify that GymB cannot see GymA's member data.
    """
    # Register and login tenant A
    await client.post("/api/v1/auth/register", json={
        "gym_name": "GymA",
        "full_name": "Owner A",
        "email": "a_owner@test.com",
        "password": "testpass123",
        "city": "Test City A",
    })
    r = await client.post("/api/v1/auth/login", json={
        "email": "a_owner@test.com",
        "password": "testpass123",
    })
    assert r.status_code == 200
    token_a = r.json()["access_token"]

    # Register and login tenant B
    await client.post("/api/v1/auth/register", json={
        "gym_name": "GymB",
        "full_name": "Owner B",
        "email": "b_owner@test.com",
        "password": "testpass123",
        "city": "Test City B",
    })
    r = await client.post("/api/v1/auth/login", json={
        "email": "b_owner@test.com",
        "password": "testpass123",
    })
    assert r.status_code == 200
    token_b = r.json()["access_token"]

    # Tenant A creates a member (email único: la tenant DB persiste entre corridas)
    r = await client.post(
        "/api/v1/members",
        json={
            "full_name": "Member of A",
            "email": f"member-{uuid.uuid4().hex[:8]}@gyma.com",
            "id_type": "CC", "id_number": str(uuid.uuid4().int)[:10],
            "status": "active",
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 201, r.text

    # Tenant A lists members — should see Member of A (positive check)
    r = await client.get(
        "/api/v1/members",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    members = r.json()
    names = [m["full_name"] for m in members]
    assert (
        "Member of A" in names
    ), "Member was not created successfully under Tenant A"

    # Tenant B lists members — should NOT see Member of A (isolation check)
    r = await client.get(
        "/api/v1/members",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 200
    members = r.json()
    names = [m["full_name"] for m in members]
    assert (
        "Member of A" not in names
    ), "Tenant B can see Tenant A's member — isolation BROKEN"
