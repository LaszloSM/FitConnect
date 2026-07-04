"""Helpers compartidos para crear miembros en tests.

Desde la Fase 2 el alta de miembros (MemberCreate) exige datos de contacto,
salud (PAR-Q + emergencia) y una membresía (plan_id) que inicia hoy. Los
miembros "sin membresía" (estado real de los importados de Excel) se obtienen
cancelando la membresía inicial.
"""
import uuid

PARQ_OK = {f"q{i}": False for i in range(1, 8)}


def full_member_fields(**overrides):
    fields = {
        "full_name": "Miembro Test",
        "email": f"m-{uuid.uuid4().hex[:10]}@test.com",
        "id_type": "CC",
        "id_number": str(uuid.uuid4().int)[:10],
        "phone": "3001112233",
        "birth_date": "1995-05-10",
        "address": "Calle 1 # 2-33",
        "city": "Bogotá",
        "emergency_contact_name": "Contacto Emergencia",
        "emergency_contact_phone": "3009998877",
        "parq_answers": dict(PARQ_OK),
    }
    fields.update(overrides)
    return fields


async def create_plan(client, headers, duration_days=30, price=50000, **extra):
    r = await client.post("/api/v1/member-plans/", json={
        "name": f"Plan {uuid.uuid4().hex[:6]}",
        "price": price,
        "duration_days": duration_days,
        **extra,
    }, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def create_member(client, headers, plan_id=None, duration_days=30, **overrides):
    """Alta completa: devuelve el miembro creado, con membresía activa desde hoy."""
    if plan_id is None:
        plan_id = await create_plan(client, headers, duration_days=duration_days)
    payload = full_member_fields(**overrides)
    payload["plan_id"] = str(plan_id)
    r = await client.post("/api/v1/members", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def create_member_without_membership(client, headers, **overrides):
    """Miembro sin membresía vigente: alta completa + cancelar la membresía inicial."""
    member = await create_member(client, headers, **overrides)
    ms = await client.get(f"/api/v1/members/{member['id']}/memberships", headers=headers)
    for m in ms.json():
        if m.get("status") != "cancelled":
            r = await client.post(f"/api/v1/memberships/{m['id']}/cancel", headers=headers)
            assert r.status_code == 200, r.text
    return member
