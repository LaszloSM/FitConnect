#!/usr/bin/env python3
"""
End-to-end tests for SaaS Gym MVP.
Run this after `docker-compose up --build` is running.
"""

import asyncio
import sys
import uuid
from datetime import datetime

import httpx

BASE_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:3000"
API = f"{BASE_URL}/api/v1"


async def test_health():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/health")
        assert r.status_code == 200, f"Health check failed: {r.text}"
        print("[PASS] Health check")


async def test_register():
    """Register a new gym (creates tenant DB + tables + owner staff)."""
    async with httpx.AsyncClient() as client:
        unique = uuid.uuid4().hex[:8]
        payload = {
            "email": f"owner_{unique}@test.com",
            "password": "SecurePass123!",
            "full_name": "Test Owner",
            "gym_name": f"Test Gym {unique}",
            "city": "Bogota",
        }
        r = await client.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 201, f"Register failed: {r.text}"
        data = r.json()
        assert "tenant_id" in data
        assert "db_name" in data
        print(f"[PASS] Register -> tenant_id={data['tenant_id']}, db_name={data['db_name']}")
        return payload["email"], payload["password"], data["db_name"]


async def test_login(email: str, password: str):
    """Login and get JWT with db_name."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{API}/auth/login",
            json={"email": email, "password": password},
        )
        assert r.status_code == 200, f"Login failed: {r.text}"
        data = r.json()
        assert "access_token" in data
        assert data["db_name"]
        assert data["role"] == "owner"
        print(f"[PASS] Login -> got JWT with db_name={data['db_name']}")
        return data["access_token"]


PARQ_OK = {f"q{i}": False for i in range(1, 8)}


def full_member_fields(**overrides):
    """Mismo contrato que backend/tests/helpers.py: el alta exige contacto, salud
    (PAR-Q + emergencia) y un plan. Este script quedó dos fases atrás y fallaba en
    el primer paso; si vuelve a pasar, mira ese helper."""
    fields = {
        "full_name": "Miembro E2E",
        "email": f"m-{uuid.uuid4().hex[:10]}@test.com",
        "id_type": "CC",
        "id_number": str(uuid.uuid4().int)[:10],
        "phone": "3001112233",
        "birth_date": "1995-05-10",
        "address": "Calle 1 # 2-33",
        "city": "Bogota",
        "emergency_contact_name": "Contacto Emergencia",
        "emergency_contact_phone": "3009998877",
        "parq_answers": dict(PARQ_OK),
    }
    fields.update(overrides)
    return fields


async def _create_plan(client, token: str) -> str:
    r = await client.post(
        f"{API}/member-plans/",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": f"Mensual {uuid.uuid4().hex[:6]}", "price": "80000.00", "duration_days": 30},
    )
    assert r.status_code in (200, 201), f"Plan create failed: {r.text}"
    return r.json()["id"]


async def _create_member(client, token: str, **overrides) -> str:
    plan_id = overrides.pop("plan_id", None) or await _create_plan(client, token)
    r = await client.post(
        f"{API}/members",
        headers={"Authorization": f"Bearer {token}"},
        json=full_member_fields(plan_id=plan_id, **overrides),
    )
    assert r.status_code == 201, f"Member create failed: {r.text}"
    return r.json()["id"]


async def test_dashboard_kpis(token: str):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{API}/dashboard/kpis",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, f"Dashboard failed: {r.text}"
        data = r.json()
        assert "kpis" in data
        assert "member_growth" in data
        assert "revenue_history" in data
        print(f"[PASS] Dashboard KPIs -> total_members={data['kpis']['total_members']}")


async def test_members_crud(token: str):
    async with httpx.AsyncClient() as client:
        member_id = await _create_member(client, token, full_name="Juan Perez")
        print(f"[PASS] Member created -> {member_id}")

        # List
        r = await client.get(
            f"{API}/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        members = r.json()
        assert len(members) >= 1
        print(f"[PASS] Members list -> {len(members)} members")

        # Update
        r = await client.put(
            f"{API}/members/{member_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"full_name": "Juan Perez Updated"},
        )
        assert r.status_code == 200
        assert r.json()["full_name"] == "Juan Perez Updated"
        print("[PASS] Member updated")

        # Delete
        r = await client.delete(
            f"{API}/members/{member_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 204
        print("[PASS] Member deleted")


async def test_payments(token: str):
    async with httpx.AsyncClient() as client:
        # Los turnos de caja vienen activos por defecto; este gym de prueba cobra directo.
        await client.patch(
            f"{API}/settings/operations",
            headers={"Authorization": f"Bearer {token}"},
            json={"cash_shifts_enabled": False},
        )
        # First create a member to attach payment to
        member_id = await _create_member(client, token, full_name="Pago Test")

        r = await client.post(
            f"{API}/payments",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "member_id": member_id,
                "amount": "50000.00",
                "method": "cash",
                "concept": "Mensualidad mayo",
                "status": "paid",
            },
        )
        assert r.status_code == 201, f"Payment create failed: {r.text}"
        print(f"[PASS] Payment created -> ${r.json()['amount']}")


async def test_checkins(token: str):
    async with httpx.AsyncClient() as client:
        member_id = await _create_member(client, token, full_name="Checkin Test")

        r = await client.post(
            f"{API}/checkins",
            headers={"Authorization": f"Bearer {token}"},
            json={"member_id": member_id, "type": "entry"},
        )
        assert r.status_code == 201, f"Checkin failed: {r.text}"
        print("[PASS] Check-in registered")


async def test_classes(token: str):
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{API}/classes",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Yoga",
                "instructor": "Maria Lopez",
                "schedule": "Lun/Mie 18:00",
                "max_capacity": 20,
                "duration_minutes": 60,
            },
        )
        assert r.status_code == 201, f"Class create failed: {r.text}"
        print(f"[PASS] Class created -> {r.json()['name']}")


async def test_machines(token: str):
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{API}/machines",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Cinta de correr",
                "brand": "Technogym",
                "status": "active",
            },
        )
        assert r.status_code == 201, f"Machine create failed: {r.text}"
        print(f"[PASS] Machine created -> {r.json()['name']}")


async def test_reports(token: str):
    async with httpx.AsyncClient() as client:
        for endpoint in [
            "member-status",
            "payment-methods",
            "attendance-today",
            "expiring-memberships",
        ]:
            r = await client.get(
                f"{API}/reports/{endpoint}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r.status_code == 200, f"Report {endpoint} failed: {r.text}"
            print(f"[PASS] Report/{endpoint} -> OK")


async def test_frontend_build():
    # El dev server compila cada ruta en el primer request: sin margen da ReadTimeout.
    async with httpx.AsyncClient(timeout=120) as client:
        for path in ["/login", "/register", "/dashboard", "/members"]:
            r = await client.get(f"{FRONTEND_URL}{path}", follow_redirects=True)
            assert r.status_code == 200, f"Frontend {path} failed: {r.status_code}"
            print(f"[PASS] Frontend {path} -> 200")


async def main():
    print("=" * 60)
    print("SaaS Gym MVP - End-to-End Tests")
    print("=" * 60)

    try:
        await test_health()
        email, password, db_name = await test_register()
        token = await test_login(email, password)
        await test_dashboard_kpis(token)
        await test_members_crud(token)
        await test_payments(token)
        await test_checkins(token)
        await test_classes(token)
        await test_machines(token)
        await test_reports(token)
        await test_frontend_build()

        print("\n" + "=" * 60)
        print("TODOS LOS TESTS PASARON")
        print("=" * 60)
        return 0
    except AssertionError as e:
        print(f"\n[FAIL] {e}")
        return 1
    except Exception as e:
        print(f"\n[ERROR] {type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
