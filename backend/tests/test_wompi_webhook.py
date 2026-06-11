import hashlib
import uuid

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.crypto import encrypt_secret
from app.models.tenant.gym_settings import GymSettings
from app.models.tenant.member import Member
from app.models.tenant.member_plan import MemberPlan
from app.models.tenant.membership import Membership, MembershipStatus
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.payment_link import PaymentLink
from app.models.tenant.receipt import Receipt

EVENTS_SECRET = "test_events_secret_123"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _register(client, email):
    r = await client.post("/api/v1/auth/register", json={
        "email": email, "password": "Pass123456!",
        "full_name": "Owner Wompi", "gym_name": "Wompi Gym", "city": "Bogotá",
    })
    if r.status_code == 201:
        return r.json()["db_name"], r.json()["tenant_id"]
    # ya existía: resolver db_name vía login + master
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "Pass123456!"})
    return login.json()["db_name"], login.json()["tenant_id"]


async def _tenant_session(db_name):
    url = settings.tenant_database_url_template.replace("{db_name}", db_name)
    engine = create_async_engine(url)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


async def _slug_for(db_name):
    from app.db.master_session import MasterSessionLocal
    from app.models.master.tenant import Tenant
    async with MasterSessionLocal() as db:
        t = (await db.execute(select(Tenant).where(Tenant.db_name == db_name))).scalar_one()
        return t.slug


def _make_signed_body(reference, transaction_id, status, amount_in_cents):
    """Construye el cuerpo del webhook con una firma válida."""
    properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"]
    timestamp = 1700000000
    concatenated = f"{transaction_id}{status}{amount_in_cents}{timestamp}{EVENTS_SECRET}"
    checksum = hashlib.sha256(concatenated.encode()).hexdigest()
    return {
        "event": "transaction.updated",
        "data": {"transaction": {
            "id": transaction_id, "status": status,
            "amount_in_cents": amount_in_cents, "reference": reference,
        }},
        "signature": {"properties": properties, "checksum": checksum},
        "timestamp": timestamp,
    }


async def _seed_payment_link(db_name, *, status="APPROVED_PENDING", intent=None):
    engine, Session = await _tenant_session(db_name)
    try:
        async with Session() as db:
            # gym_settings con events_secret cifrado
            gym = (await db.execute(select(GymSettings).limit(1))).scalar_one_or_none()
            if not gym:
                gym = GymSettings()
                db.add(gym)
            gym.wompi_public_key = "pub_test"
            gym.wompi_private_key = encrypt_secret("prv_test")
            gym.wompi_events_secret = encrypt_secret(EVENTS_SECRET)
            await db.flush()

            member = Member(full_name="Pagador Web", email=f"w-{uuid.uuid4().hex[:8]}@t.co")
            db.add(member)
            await db.flush()

            plan = None
            if intent:
                plan = MemberPlan(name="PlanWeb", price=100000, duration_days=30, is_active=True)
                db.add(plan)
                await db.flush()

            payment = Payment(
                member_id=member.id, amount=100000, method=PaymentMethod.wompi,
                status=PaymentStatus.pending, concept="Renovación web",
            )
            db.add(payment)
            await db.flush()

            slug = await _slug_for(db_name)
            reference = f"FC-{slug}-{payment.id.hex[:12]}"
            link = PaymentLink(
                payment_id=payment.id, reference=reference,
                amount_in_cents=10000000, status="created",
                membership_intent={"member_id": str(member.id), "plan_id": str(plan.id)} if plan else None,
            )
            db.add(link)
            await db.commit()
            return reference, str(payment.id), str(member.id)
    finally:
        await engine.dispose()


async def _payment_status(db_name, payment_id):
    engine, Session = await _tenant_session(db_name)
    try:
        async with Session() as db:
            p = (await db.execute(select(Payment).where(Payment.id == uuid.UUID(payment_id)))).scalar_one()
            return p.status
    finally:
        await engine.dispose()


async def _receipt_count(db_name, payment_id):
    engine, Session = await _tenant_session(db_name)
    try:
        async with Session() as db:
            rows = (await db.execute(select(Receipt).where(Receipt.payment_id == uuid.UUID(payment_id)))).scalars().all()
            return len(rows)
    finally:
        await engine.dispose()


async def _membership_count(db_name, member_id):
    engine, Session = await _tenant_session(db_name)
    try:
        async with Session() as db:
            rows = (await db.execute(select(Membership).where(Membership.member_id == uuid.UUID(member_id)))).scalars().all()
            return len(rows)
    finally:
        await engine.dispose()


async def test_valid_signature_confirms_and_renews(client):
    db_name, _ = await _register(client, "wompi@gym.com")
    reference, payment_id, member_id = await _seed_payment_link(db_name, intent=True)
    # txn id único: webhook_events persiste entre corridas y la idempotencia
    # por event_id ignoraría un id repetido
    body = _make_signed_body(reference, f"txn_{uuid.uuid4().hex[:10]}", "APPROVED", 10000000)

    r = await client.post("/api/v1/webhooks/wompi", json=body)
    assert r.status_code == 200, r.text
    assert await _payment_status(db_name, payment_id) == PaymentStatus.paid
    assert await _receipt_count(db_name, payment_id) == 1
    # El intent creó la membresía
    assert await _membership_count(db_name, member_id) == 1


async def test_invalid_signature_rejected(client):
    db_name, _ = await _register(client, "wompi@gym.com")
    reference, payment_id, _ = await _seed_payment_link(db_name)
    body = _make_signed_body(reference, f"txn_{uuid.uuid4().hex[:10]}", "APPROVED", 10000000)
    body["signature"]["checksum"] = "deadbeef"

    r = await client.post("/api/v1/webhooks/wompi", json=body)
    assert r.status_code == 403
    assert await _payment_status(db_name, payment_id) == PaymentStatus.pending


async def test_idempotent_double_event(client):
    db_name, _ = await _register(client, "wompi@gym.com")
    reference, payment_id, _ = await _seed_payment_link(db_name)
    body = _make_signed_body(reference, f"txn_{uuid.uuid4().hex[:10]}", "APPROVED", 10000000)

    r1 = await client.post("/api/v1/webhooks/wompi", json=body)
    r2 = await client.post("/api/v1/webhooks/wompi", json=body)
    assert r1.status_code == 200 and r2.status_code == 200
    assert await _payment_status(db_name, payment_id) == PaymentStatus.paid
    assert await _receipt_count(db_name, payment_id) == 1  # un solo recibo


async def test_unknown_tenant_reference(client):
    body = _make_signed_body("FC-noexiste-000000000000", "txn_x", "APPROVED", 1000)
    r = await client.post("/api/v1/webhooks/wompi", json=body)
    assert r.status_code == 404
