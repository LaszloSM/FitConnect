"""La app móvil: lo de la persona (cuenta, consentimientos, entrenos) y lo de su
gimnasio cuando vinculó la ficha (membresía, QR, clases, rutina, pagos, avisos).

Toda ruta de un gimnasio pasa por `_gym`: el vínculo tiene que ser de quien
pregunta, estar vigente, y el gimnasio tener encendida la app para socios.
Un vínculo ajeno responde 404, nunca 403.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_user
from app.core.rate_limit import limiter
from app.core.timeutil import today_bogota, utcnow_naive
from app.db.app_db import app_session
from app.db.master_session import get_master_db
from app.models.app import AppProfile, Workout
from app.models.master.app_user import AppPushToken, AppUser, MemberLink
from app.models.master.exercise import Exercise
from app.models.master.tenant import Tenant
from app.models.tenant.announcement import Announcement
from app.models.tenant.checkin import CheckIn
from app.models.tenant.class_session import ClassSession
from app.models.tenant.gym_class import GymClass
from app.models.tenant.member import Member
from app.models.tenant.member_plan import MemberPlan
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.payment_link import PaymentLink
from app.models.tenant.routine import MemberRoutine, Routine
from app.models.tenant.session_booking import SessionBooking
from app.schemas.member import normalize_id_number
from app.services import app_accounts, bookings, member_profile, subscription
from app.services.audit import audit
from app.services.checkin import checkin_status, entries_left
from app.services.device_directory import tenant_session
from app.services.exercise_catalog import exercise_out
from app.services.gym_settings import get_gym_settings
from app.services.staff_member import STAFF_PLAN_NAME

router = APIRouter(prefix="/me", tags=["app"], dependencies=[Depends(get_app_user)])
BOGOTA = ZoneInfo("America/Bogota")

_NO_GYM = "No encontramos ese gimnasio en tu cuenta."
_APP_OFF = "Tu gimnasio todavía no tiene activa la app para socios."


def _bogota(dt: datetime | None) -> str | None:
    return dt.replace(tzinfo=timezone.utc).astimezone(BOGOTA).isoformat() if dt else None


def _gym_out(link: MemberLink, tenant: Tenant) -> dict:
    eff = subscription.effective(tenant)
    return {
        "link_id": str(link.id), "gym_name": tenant.name, "slug": tenant.slug, "logo_url": tenant.logo_url,
        "city": tenant.city, "app_enabled": "member_app" in eff["modules"] and eff["status"] != "suspended",
    }


async def _gym(link_id: uuid.UUID, user: AppUser, master: AsyncSession) -> tuple[MemberLink, Tenant]:
    row = (await master.execute(
        select(MemberLink, Tenant).join(Tenant, Tenant.id == MemberLink.tenant_id)
        .where(MemberLink.id == link_id, MemberLink.app_user_id == user.id, MemberLink.revoked_at.is_(None))
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail=_NO_GYM)
    link, tenant = row
    if not _gym_out(link, tenant)["app_enabled"]:
        raise HTTPException(status_code=403, detail=_APP_OFF)
    return link, tenant


async def _member(db: AsyncSession, link: MemberLink) -> Member:
    member = await db.get(Member, link.member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Tu ficha ya no existe en el gimnasio. Acércate a recepción.")
    return member


# ─── Cuenta ───

class ProfileIn(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=255)
    birth_date: Optional[date] = None
    sex: Optional[Literal["female", "male", "other"]] = None
    height_cm: Optional[int] = Field(default=None, ge=100, le=250)
    weight_kg: Optional[float] = Field(default=None, ge=25, le=350)
    goal: Optional[Literal["lose_fat", "gain_muscle", "maintain", "performance", "health"]] = None
    activity_level: Optional[Literal["sedentary", "light", "moderate", "active", "very_active"]] = None

    @field_validator("birth_date")
    @classmethod
    def _adult(cls, v: Optional[date]) -> Optional[date]:
        if v is None:
            return v
        today = today_bogota()
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 14 or age > 110:
            raise ValueError("La app es para personas de 14 años en adelante")
        return v


def _profile_out(p: AppProfile | None) -> dict:
    if p is None:
        return {"birth_date": None, "sex": None, "height_cm": None, "weight_kg": None, "goal": None,
                "activity_level": None}
    return {"birth_date": p.birth_date.isoformat() if p.birth_date else None, "sex": p.sex,
            "height_cm": p.height_cm, "weight_kg": float(p.weight_kg) if p.weight_kg is not None else None,
            "goal": p.goal, "activity_level": p.activity_level}


@router.get("")
async def me(user: AppUser = Depends(get_app_user), master: AsyncSession = Depends(get_master_db)):
    async with app_session() as adb:
        profile = await adb.get(AppProfile, user.id)
    return {
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name,
                 "created_at": user.created_at.isoformat()},
        "profile": _profile_out(profile),
        "consents": await app_accounts.consents(master, user.id),
        "consent_labels": app_accounts.CONSENTS,
        "gyms": [_gym_out(link, t) for link, t in await app_accounts.active_links(master, user.id)],
    }


@router.patch("")
async def update_me(payload: ProfileIn, user: AppUser = Depends(get_app_user),
                    master: AsyncSession = Depends(get_master_db)):
    data = payload.model_dump(exclude_unset=True)
    if "full_name" in data:
        user.full_name = (data.pop("full_name") or "").strip() or None
    if {"height_cm", "weight_kg"} & {k for k, v in data.items() if v is not None}:
        if not (await app_accounts.consents(master, user.id))["health"]:
            raise HTTPException(status_code=422, detail="Para guardar tu peso y talla autoriza el uso de tus datos de salud.")
    async with app_session() as adb:
        profile = await adb.get(AppProfile, user.id)
        if profile is None:
            profile = AppProfile(app_user_id=user.id)
            adb.add(profile)
        for k, v in data.items():
            setattr(profile, k, v)
        await adb.commit()
    await master.commit()
    return {"ok": True, "profile": _profile_out(profile)}


class ConsentIn(BaseModel):
    kind: str = Field(max_length=30)
    granted: bool


@router.post("/consents")
async def set_consent(payload: ConsentIn, user: AppUser = Depends(get_app_user),
                      master: AsyncSession = Depends(get_master_db)):
    app_accounts.record_consent(master, user.id, payload.kind, payload.granted)
    if payload.kind == "health" and not payload.granted:
        # Retirar la autorización borra lo que dependía de ella.
        async with app_session() as adb:
            profile = await adb.get(AppProfile, user.id)
            if profile is not None:
                profile.height_cm = profile.weight_kg = None
                await adb.commit()
    if payload.kind == "notifications" and not payload.granted:
        await master.execute(AppPushToken.__table__.delete().where(AppPushToken.app_user_id == user.id))
    await master.commit()
    return {"consents": await app_accounts.consents(master, user.id)}


@router.delete("", status_code=204)
async def delete_me(user: AppUser = Depends(get_app_user), master: AsyncSession = Depends(get_master_db)):
    await app_accounts.delete_account(master, user)


class PushTokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=255)
    platform: Optional[Literal["ios", "android", "web"]] = None


@router.post("/push-token")
async def register_push(payload: PushTokenIn, user: AppUser = Depends(get_app_user),
                        master: AsyncSession = Depends(get_master_db)):
    if not (await app_accounts.consents(master, user.id))["notifications"]:
        raise HTTPException(status_code=422, detail="Primero autoriza los avisos en el celular.")
    row = (await master.execute(select(AppPushToken).where(AppPushToken.token == payload.token))).scalar_one_or_none()
    if row is None:
        master.add(AppPushToken(app_user_id=user.id, token=payload.token, platform=payload.platform))
    else:
        row.app_user_id, row.platform = user.id, payload.platform
    await master.commit()
    return {"ok": True}


# ─── Vincular la ficha del gimnasio ───

class LinkIn(BaseModel):
    code: str = Field(min_length=6, max_length=20)
    id_number: str = Field(min_length=3, max_length=50)


_LINK_FAIL = "El código o el documento no coinciden. Revisa ambos o pide un código nuevo en recepción."


@router.post("/links", status_code=201)
@limiter.limit("10/minute")
async def link_gym(request: Request, payload: LinkIn, user: AppUser = Depends(get_app_user),
                   master: AsyncSession = Depends(get_master_db)):
    code = await app_accounts.find_link_code(master, payload.code)
    if code is None:
        raise HTTPException(status_code=400, detail=_LINK_FAIL)
    tenant = await master.get(Tenant, code.tenant_id)
    eff = subscription.effective(tenant)
    if eff["status"] == "suspended" or "member_app" not in eff["modules"]:
        raise HTTPException(status_code=403, detail=_APP_OFF)
    async with tenant_session(tenant.db_name) as db:
        member = await db.get(Member, code.member_id)
        if member is None or not member.id_number or member.id_number != normalize_id_number(payload.id_number):
            code.attempts += 1
            await master.commit()
            raise HTTPException(status_code=400, detail=_LINK_FAIL)
        mine = (await master.execute(select(MemberLink).where(
            MemberLink.app_user_id == user.id, MemberLink.tenant_id == tenant.id, MemberLink.revoked_at.is_(None)
        ))).scalar_one_or_none()
        if mine is not None and mine.member_id != member.id:
            raise HTTPException(status_code=409, detail="Tu cuenta ya está vinculada a otra ficha de este gimnasio.")
        now = datetime.utcnow()
        # Recepción entregó el código a esta persona: si la ficha estaba en otra
        # cuenta (celular nuevo, otro correo), ese vínculo se cierra.
        prev = (await master.execute(select(MemberLink).where(
            MemberLink.tenant_id == tenant.id, MemberLink.member_id == member.id, MemberLink.revoked_at.is_(None),
            MemberLink.app_user_id != user.id,
        ))).scalars().all()
        for p in prev:
            p.revoked_at = now
        await master.flush()
        link = mine or MemberLink(app_user_id=user.id, tenant_id=tenant.id, db_name=tenant.db_name, member_id=member.id)
        master.add(link)
        code.used_at = now
        if not user.full_name:
            user.full_name = member.full_name
        audit(db, None, "member.app_linked", "member", member.id, {"replaced": len(prev)}, actor_name="El socio (app)")
        await db.commit()
    await master.commit()
    return _gym_out(link, tenant)


@router.delete("/links/{link_id}")
async def unlink_gym(link_id: uuid.UUID, user: AppUser = Depends(get_app_user),
                     master: AsyncSession = Depends(get_master_db)):
    link = (await master.execute(select(MemberLink).where(
        MemberLink.id == link_id, MemberLink.app_user_id == user.id, MemberLink.revoked_at.is_(None)
    ))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail=_NO_GYM)
    link.revoked_at = datetime.utcnow()
    await master.commit()
    return {"ok": True}


# ─── Mi gimnasio ───

_STATUS_ES = {
    "ok": "Al día", "in_grace": "En días de gracia", "scheduled": "Empieza pronto", "expired": "Vencida",
    "frozen": "Congelada", "no_entries": "Sin entradas", "no_membership": "Sin membresía",
}


@router.get("/gyms/{link_id}")
async def gym_summary(link_id: uuid.UUID, user: AppUser = Depends(get_app_user),
                      master: AsyncSession = Depends(get_master_db)):
    link, tenant = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        member = await _member(db, link)
        gym = await get_gym_settings(db)
        status, m = await checkin_status(member.id, db, gym.grace_days)
        today = today_bogota()
        inside = (await db.execute(select(func.count()).select_from(CheckIn).where(
            CheckIn.decision == "allowed", CheckIn.created_at >= utcnow_naive() - timedelta(minutes=90)
        ))).scalar() or 0
        next_bookings = (await db.execute(
            select(SessionBooking, ClassSession, GymClass)
            .join(ClassSession, ClassSession.id == SessionBooking.session_id)
            .join(GymClass, GymClass.id == ClassSession.gym_class_id)
            .where(SessionBooking.member_id == member.id, SessionBooking.status.in_(["booked", "waitlisted"]),
                   ClassSession.session_date >= today)
            .order_by(ClassSession.session_date, ClassSession.start_time).limit(3)
        )).all()
        profile = member_profile.status(member)
    return {
        "gym": {**_gym_out(link, tenant), "address": tenant.address, "phone": tenant.phone,
                "operating_hours": tenant.operating_hours},
        "member": {"first_name": (member.full_name or "").split(" ")[0].title(), "full_name": member.full_name},
        "membership": {
            "status": status, "status_label": _STATUS_ES.get(status, status),
            "can_enter": status in ("ok", "in_grace"),
            "plan_name": m.plan_name if m else None,
            "end_date": m.end_date.isoformat() if m and m.end_date else None,
            "days_left": (m.end_date - today).days if m and m.end_date else None,
            "entries_left": entries_left(m) if m else None,
        },
        "occupancy": {"recent_entries": inside, "window_minutes": 90},
        "profile": {"complete": profile["complete"], "percent": profile["percent"],
                    "missing": [profile["labels"][k] for k in profile["missing"]]},
        "next_bookings": [
            {"booking_id": str(b.id), "session_id": str(s.id), "class_name": gc.name, "status": b.status,
             "session_date": s.session_date.isoformat(), "start_time": s.start_time.isoformat()[:5]}
            for b, s, gc in next_bookings
        ],
        # El celular deriva la llave de cada día: HMAC-SHA1(secret, "AAAA-MM-DD" de Bogotá) → TOTP de 30 s.
        "qr": {"secret": app_accounts.qr_secret(link.id), "prefix": app_accounts.QR_PREFIX, "ref": link.id.hex,
               "period": 30, "digits": 6, "day_keys": True},
    }


@router.get("/gyms/{link_id}/classes")
async def gym_classes(link_id: uuid.UUID, days: int = Query(7, ge=1, le=14), user: AppUser = Depends(get_app_user),
                      master: AsyncSession = Depends(get_master_db)):
    link, _ = await _gym(link_id, user, master)
    today = today_bogota()
    async with tenant_session(link.db_name) as db:
        rows = (await db.execute(
            select(ClassSession, GymClass).join(GymClass, GymClass.id == ClassSession.gym_class_id)
            .where(ClassSession.session_date >= today, ClassSession.session_date <= today + timedelta(days=days),
                   ClassSession.status != "cancelled")
            .order_by(ClassSession.session_date, ClassSession.start_time)
        )).all()
        ids = [s.id for s, _ in rows]
        counts = dict((await db.execute(
            select(SessionBooking.session_id, func.count()).where(
                SessionBooking.session_id.in_(ids), SessionBooking.status == "booked").group_by(SessionBooking.session_id)
        )).all()) if ids else {}
        mine = {b.session_id: b for b in (await db.execute(select(SessionBooking).where(
            SessionBooking.session_id.in_(ids), SessionBooking.member_id == link.member_id,
            SessionBooking.status.in_(["booked", "waitlisted"])
        ))).scalars().all()} if ids else {}
    now = datetime.now(BOGOTA).replace(tzinfo=None)
    out = []
    for s, gc in rows:
        if datetime.combine(s.session_date, s.start_time) < now:
            continue
        b = mine.get(s.id)
        cap = bookings.capacity(s, gc)
        out.append({
            "session_id": str(s.id), "class_name": gc.name, "instructor": s.instructor_override or gc.instructor,
            "color": gc.color, "session_date": s.session_date.isoformat(), "start_time": s.start_time.isoformat()[:5],
            "duration_minutes": gc.duration_minutes, "capacity": cap, "booked": counts.get(s.id, 0),
            "spots_left": max(cap - counts.get(s.id, 0), 0),
            "my_booking": {"booking_id": str(b.id), "status": b.status, "waitlist_position": b.waitlist_position} if b else None,
        })
    return out


@router.post("/gyms/{link_id}/classes/{session_id}/book", status_code=201)
@limiter.limit("20/minute")
async def book_class(request: Request, link_id: uuid.UUID, session_id: uuid.UUID,
                     user: AppUser = Depends(get_app_user), master: AsyncSession = Depends(get_master_db)):
    link, _ = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        session = await db.get(ClassSession, session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Clase no encontrada")
        if datetime.combine(session.session_date, session.start_time) < datetime.now(BOGOTA).replace(tzinfo=None):
            raise HTTPException(status_code=400, detail="Esa clase ya empezó")
        return await bookings.book(db, session_id, link.member_id, duplicate_detail="Ya tienes un cupo en esta clase")


@router.delete("/gyms/{link_id}/classes/{session_id}/book/{booking_id}")
async def cancel_class(link_id: uuid.UUID, session_id: uuid.UUID, booking_id: uuid.UUID,
                       user: AppUser = Depends(get_app_user), master: AsyncSession = Depends(get_master_db)):
    link, _ = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        result = await bookings.cancel(db, session_id, booking_id, member_id=link.member_id)
    return {"cancelled": result["cancelled"]}


@router.get("/gyms/{link_id}/routine")
async def gym_routine(link_id: uuid.UUID, user: AppUser = Depends(get_app_user),
                      master: AsyncSession = Depends(get_master_db)):
    from app.api.v1.routines import _routine_detail
    link, _ = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        row = (await db.execute(
            select(MemberRoutine, Routine).join(Routine, Routine.id == MemberRoutine.routine_id)
            .where(MemberRoutine.member_id == link.member_id, MemberRoutine.ended_at.is_(None))
            .order_by(desc(MemberRoutine.assigned_at)).limit(1)
        )).first()
        if not row:
            return {"routine": None}
        mr, routine = row
        detail = await _routine_detail(db, master, routine)
    detail.pop("assigned_count", None)
    return {"routine": detail, "assigned_at": mr.assigned_at.isoformat(), "notes": mr.notes}


@router.get("/gyms/{link_id}/payments")
async def gym_payments(link_id: uuid.UUID, user: AppUser = Depends(get_app_user),
                       master: AsyncSession = Depends(get_master_db)):
    link, _ = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        rows = (await db.execute(
            select(Payment).where(Payment.member_id == link.member_id,
                                  Payment.status.in_([PaymentStatus.paid, PaymentStatus.refunded]))
            .order_by(desc(Payment.created_at)).limit(50)
        )).scalars().all()
    return [{
        "id": str(p.id), "date": _bogota(p.created_at), "concept": p.concept,
        "amount": int(p.amount), "refunded": int(p.refunded_amount or 0),
        "method": getattr(p.method, "value", p.method), "status": getattr(p.status, "value", p.status),
    } for p in rows]


@router.get("/gyms/{link_id}/plans")
async def gym_plans(link_id: uuid.UUID, user: AppUser = Depends(get_app_user),
                    master: AsyncSession = Depends(get_master_db)):
    link, _ = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        plans = (await db.execute(select(MemberPlan).where(
            MemberPlan.is_active.is_(True), MemberPlan.name != STAFF_PLAN_NAME).order_by(MemberPlan.price)
        )).scalars().all()
        gym = await get_gym_settings(db)
        from app.services.gym_settings import secret
        online = bool(gym.wompi_public_key and secret(gym, "wompi_private_key"))
    return {"online_payments": online, "plans": [
        {"id": str(p.id), "name": p.name, "price": int(p.price), "duration_days": p.duration_days,
         "description": p.description, "entries_total": p.entries_total} for p in plans]}


class RenewIn(BaseModel):
    plan_id: uuid.UUID


@router.post("/gyms/{link_id}/renew")
@limiter.limit("10/minute")
async def renew(request: Request, link_id: uuid.UUID, payload: RenewIn, user: AppUser = Depends(get_app_user),
                master: AsyncSession = Depends(get_master_db)):
    """Link de pago Wompi del gimnasio. La membresía se crea cuando Wompi confirma
    el pago (webhook), igual que el link que manda recepción."""
    from app.services.gym_settings import secret
    from app.services.payment_links import create_payment_link_for
    link, tenant = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        member = await _member(db, link)
        plan = (await db.execute(select(MemberPlan).where(
            MemberPlan.id == payload.plan_id, MemberPlan.is_active.is_(True), MemberPlan.name != STAFF_PLAN_NAME
        ))).scalar_one_or_none()
        if plan is None:
            raise HTTPException(status_code=404, detail="Ese plan ya no está disponible")
        gym = await get_gym_settings(db)
        if not (gym.wompi_public_key and secret(gym, "wompi_private_key")):
            raise HTTPException(status_code=409, detail="Tu gimnasio todavía no recibe pagos en línea. Renueva en recepción.")
        existing = (await db.execute(
            select(PaymentLink).join(Payment, Payment.id == PaymentLink.payment_id)
            .where(Payment.member_id == member.id, Payment.status == PaymentStatus.pending,
                   PaymentLink.status == "created", PaymentLink.membership_intent["plan_id"].astext == str(plan.id))
            .limit(1)
        )).scalar_one_or_none()
        if existing and existing.checkout_url:
            return {"checkout_url": existing.checkout_url, "reference": existing.reference}
        payment = Payment(member_id=member.id, amount=Decimal(str(plan.price)), method=PaymentMethod.wompi,
                          status=PaymentStatus.pending, concept=f"Renovación {plan.name} (app)", kind="membership")
        db.add(payment)
        await db.flush()
        pl = await create_payment_link_for(
            db, payment, tenant.slug, member_name=member.full_name,
            membership_intent={"member_id": str(member.id), "plan_id": str(plan.id)},
        )
        await db.commit()
    return {"checkout_url": pl.checkout_url, "reference": pl.reference}


@router.get("/gyms/{link_id}/announcements")
async def gym_announcements(link_id: uuid.UUID, user: AppUser = Depends(get_app_user),
                            master: AsyncSession = Depends(get_master_db)):
    from app.services.message_templates import render
    link, tenant = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        member = await _member(db, link)
        values = {"nombre": (member.full_name or "").split(" ")[0].title(), "gym": tenant.name}
        rows = (await db.execute(
            select(Announcement).where(Announcement.segment.in_(["all_members", "with_membership"]),
                                       Announcement.sent_at.is_not(None))
            .order_by(desc(Announcement.sent_at)).limit(20)
        )).scalars().all()
    return [{"id": str(a.id), "title": a.title, "body": render(a.body, values), "sent_at": _bogota(a.sent_at)}
            for a in rows]


_OWN_FIELDS = ("full_name", "id_type", "id_number", "phone", "email", "birth_date", "gender", "address", "city",
               "eps", "blood_type", "emergency_contact_name", "emergency_contact_phone")


@router.get("/gyms/{link_id}/profile")
async def gym_profile(link_id: uuid.UUID, user: AppUser = Depends(get_app_user),
                      master: AsyncSession = Depends(get_master_db)):
    """Lo que el gimnasio tiene registrado de la persona (derecho a conocer sus datos)."""
    link, _ = await _gym(link_id, user, master)
    async with tenant_session(link.db_name) as db:
        member = await _member(db, link)
        st = member_profile.status(member)
        data = {}
        for k in _OWN_FIELDS:
            v = getattr(member, k, None)
            data[k] = v.isoformat() if isinstance(v, date) else getattr(v, "value", v)
    return {"data": data, "status": st, "parq_done": member.parq_completed_at is not None,
            "consent_data": member.consent_data_at is not None, "consent_image": member.consent_image_at is not None}


class GymProfileIn(BaseModel):
    id_number: Optional[str] = Field(default=None, max_length=50)
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=255)
    birth_date: Optional[date] = None
    gender: Optional[str] = Field(default=None, max_length=10)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=255)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=50)
    eps: Optional[str] = Field(default=None, max_length=100)
    blood_type: Optional[str] = Field(default=None, max_length=5)
    parq_answers: Optional[dict] = None
    accept_data: bool = False


@router.post("/gyms/{link_id}/profile")
@limiter.limit("10/minute")
async def complete_gym_profile(request: Request, link_id: uuid.UUID, payload: GymProfileIn,
                               user: AppUser = Depends(get_app_user), master: AsyncSession = Depends(get_master_db)):
    """Mismo criterio que el enlace de completar ficha: solo llena lo vacío."""
    from app.models.tenant.member import Gender
    link, _ = await _gym(link_id, user, master)
    data = payload.model_dump(exclude_none=True)
    if "gender" in data:
        try:
            data["gender"] = Gender(data["gender"])
        except ValueError:
            raise HTTPException(status_code=422, detail="Sexo no válido") from None
    async with tenant_session(link.db_name) as db:
        member = await _member(db, link)
        result = await member_profile.apply_self_update(db, member, data, actor_name="El socio (app)")
        await db.commit()
    return result


# ─── Entrenos (base propia de la app) ───

class SetIn(BaseModel):
    reps: Optional[int] = Field(default=None, ge=0, le=1000)
    weight_kg: Optional[float] = Field(default=None, ge=0, le=1000)
    done: bool = True


class EntryIn(BaseModel):
    exercise_id: Optional[uuid.UUID] = None
    exercise_name: str = Field(min_length=1, max_length=255)
    sets: list[SetIn] = Field(default_factory=list, max_length=30)


class WorkoutIn(BaseModel):
    id: uuid.UUID
    title: str = Field(min_length=1, max_length=120)
    started_at: datetime
    ended_at: Optional[datetime] = None
    source: Literal["free", "gym_routine"] = "free"
    routine_ref: Optional[dict] = None
    entries: list[EntryIn] = Field(default_factory=list, max_length=40)
    notes: Optional[str] = Field(default=None, max_length=2000)


def _naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _workout_out(w: Workout) -> dict:
    return {"id": str(w.id), "title": w.title, "started_at": _bogota(w.started_at), "ended_at": _bogota(w.ended_at),
            "source": w.source, "routine_ref": w.routine_ref, "entries": w.entries, "notes": w.notes}


@router.post("/workouts")
async def save_workout(payload: WorkoutIn, user: AppUser = Depends(get_app_user)):
    """Idempotente por id: el celular reenvía lo que guardó sin señal."""
    started = _naive_utc(payload.started_at)
    if started > utcnow_naive() + timedelta(minutes=10):
        raise HTTPException(status_code=422, detail="La fecha del entreno está en el futuro")
    async with app_session() as adb:
        existing = await adb.get(Workout, payload.id)
        if existing is not None:
            if existing.app_user_id != user.id:
                raise HTTPException(status_code=409, detail="Ese entreno ya existe")
            return {"status": "duplicate", "workout": _workout_out(existing)}
        w = Workout(id=payload.id, app_user_id=user.id, title=payload.title.strip(), started_at=started,
                    ended_at=_naive_utc(payload.ended_at), source=payload.source,
                    routine_ref=payload.routine_ref,
                    entries=[{**e.model_dump(mode="json")} for e in payload.entries], notes=payload.notes)
        adb.add(w)
        await adb.commit()
        return {"status": "created", "workout": _workout_out(w)}


@router.get("/workouts")
async def list_workouts(limit: int = Query(30, ge=1, le=100), user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        rows = (await adb.execute(select(Workout).where(Workout.app_user_id == user.id)
                                  .order_by(desc(Workout.started_at)).limit(limit))).scalars().all()
    return [_workout_out(w) for w in rows]


@router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: uuid.UUID, user: AppUser = Depends(get_app_user)):
    async with app_session() as adb:
        w = await adb.get(Workout, workout_id)
        if w is None or w.app_user_id != user.id:
            raise HTTPException(status_code=404, detail="Entreno no encontrado")
        await adb.delete(w)
        await adb.commit()
    return {"ok": True}


@router.get("/progress")
async def progress(user: AppUser = Depends(get_app_user)):
    """Por ejercicio: mejor peso, último peso y la serie de mejores pesos por sesión."""
    async with app_session() as adb:
        rows = (await adb.execute(select(Workout).where(Workout.app_user_id == user.id)
                                  .order_by(Workout.started_at).limit(500))).scalars().all()
    by_ex: dict[str, dict] = {}
    for w in rows:
        day = _bogota(w.started_at)[:10]
        for e in w.entries or []:
            weights = [s.get("weight_kg") for s in e.get("sets", []) if s.get("done", True) and s.get("weight_kg")]
            reps = [s.get("reps") or 0 for s in e.get("sets", []) if s.get("done", True)]
            key = e.get("exercise_id") or e.get("exercise_name", "").strip().lower()
            item = by_ex.setdefault(key, {"exercise_id": e.get("exercise_id"), "exercise_name": e.get("exercise_name"),
                                          "sessions": 0, "best_kg": None, "last_kg": None, "series": []})
            item["sessions"] += 1
            item["total_reps"] = item.get("total_reps", 0) + sum(reps)
            if weights:
                top = max(weights)
                item["last_kg"] = top
                item["best_kg"] = top if item["best_kg"] is None else max(item["best_kg"], top)
                item["series"].append({"date": day, "kg": top})
    out = sorted(by_ex.values(), key=lambda x: -x["sessions"])
    for item in out:
        item["series"] = item["series"][-12:]
    return out


@router.get("/exercises")
async def search_exercises(q: str = Query("", max_length=80), limit: int = Query(30, ge=1, le=60),
                           master: AsyncSession = Depends(get_master_db)):
    stmt = select(Exercise).where(Exercise.is_active.is_(True))
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(Exercise.name_es.ilike(like) | Exercise.name_en.ilike(like))
    stmt = stmt.order_by(desc(Exercise.sort_weight), Exercise.name_es).limit(limit)
    return [exercise_out(e) for e in (await master.execute(stmt)).scalars().all()]
