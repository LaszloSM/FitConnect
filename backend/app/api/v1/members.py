import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_slug, require_role
from app.schemas.member import MemberCreate, MemberUpdate, MemberResponse, MembershipResponse
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.membership import Membership
from app.models.tenant.user_staff import UserRole
from app.core.timeutil import today_bogota
from app.services.gym_settings import get_gym_settings
from app.services.membership_status import effective_status

# Todo /members exige staff activo; el borrado además exige owner/admin.
router = APIRouter(prefix="/members", tags=["members"], dependencies=[Depends(get_current_staff)])


class RenewalLinkRequest(BaseModel):
    plan_id: uuid.UUID


@router.get("", response_model=list[MemberResponse])
async def list_members(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    q: str = Query("", description="Buscar por nombre, email o cédula"),
    status: MemberStatus | None = Query(None),
    missing_id_number: bool = Query(False, description="Solo miembros sin cédula registrada"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(Member)
    if q:
        search = f"%{q}%"
        stmt = stmt.where(
            or_(
                Member.full_name.ilike(search),
                Member.email.ilike(search),
                Member.id_number.ilike(search),
            )
        )
    if status:
        stmt = stmt.where(Member.status == status)
    if missing_id_number:
        stmt = stmt.where(Member.id_number.is_(None))
    stmt = stmt.order_by(Member.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    members = result.scalars().all()

    # Bulk-fetch memberships y derivar estado real (active/frozen/in_grace/expired)
    if members:
        member_ids = [m.id for m in members]
        gym = await get_gym_settings(db)

        all_stmt = select(Membership).where(
            Membership.member_id.in_(member_ids)
        ).order_by(Membership.end_date.desc())
        memberships = (await db.execute(all_stmt)).scalars().all()

        # Por miembro: preferir la membresía vigente (activa/congelada/en gracia);
        # si no hay, mostrar la más reciente (expirada/cancelada).
        best_map: dict = {}
        latest_map: dict = {}
        for mem in memberships:
            if mem.member_id not in latest_map:
                latest_map[mem.member_id] = mem
            if mem.member_id not in best_map and effective_status(
                mem, grace_days=gym.grace_days
            ) in ("active", "frozen", "in_grace"):
                best_map[mem.member_id] = mem

        responses = []
        for m in members:
            data = MemberResponse.model_validate(m)
            mem = best_map.get(m.id) or latest_map.get(m.id)
            if mem:
                data.membership_status = effective_status(mem, grace_days=gym.grace_days)
                data.membership_end_date = mem.end_date
                data.membership_plan_name = mem.plan_name
            else:
                data.membership_status = "none"
            responses.append(data)
        return responses

    return []


@router.post("", response_model=MemberResponse, status_code=201)
async def create_member(
    payload: MemberCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    existing = await db.execute(select(Member).where(Member.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    duplicate = await db.execute(
        select(Member.full_name).where(Member.id_number == payload.id_number)
    )
    holder = duplicate.scalar_one_or_none()
    if holder:
        raise HTTPException(
            status_code=409,
            detail=f"La cédula {payload.id_number} ya está registrada a nombre de {holder}",
        )

    # Separar los campos de membresía opcional del payload del miembro
    member_data = payload.model_dump(
        exclude={"plan_id", "membership_start_date", "payment_method"}
    )
    member = Member(**member_data)
    db.add(member)
    await db.flush()  # obtener member.id sin cerrar la transacción

    if payload.plan_id:
        from app.models.tenant.member_plan import MemberPlan
        from app.api.v1.member_plans import _create_membership

        plan_result = await db.execute(
            select(MemberPlan).where(MemberPlan.id == payload.plan_id)
        )
        plan = plan_result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan no encontrado")
        await _create_membership(
            db,
            member.id,
            plan,
            payload.membership_start_date or today_bogota(),
            payload.payment_method,
        )

    await db.commit()
    await db.refresh(member)
    return member


@router.get("/{member_id}/billing-summary")
async def get_billing_summary(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Resumen de cobro para el POS: membresía vigente/última, días vencidos,
    saldo pendiente y renovación sugerida con precio actual del plan."""
    from app.models.tenant.member_plan import MemberPlan
    from app.models.tenant.payment import Payment, PaymentStatus
    from app.schemas.pos import BillingSummary, BillingMembership, BillingRenewal

    member = (await db.execute(select(Member).where(Member.id == member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    gym = await get_gym_settings(db)
    today = today_bogota()
    memberships = (await db.execute(
        select(Membership).where(Membership.member_id == member_id)
        .order_by(Membership.end_date.desc())
    )).scalars().all()

    current = None
    for m in memberships:
        if effective_status(m, today=today, grace_days=gym.grace_days) in ("active", "frozen", "in_grace"):
            current = m
            break
    latest = current or (memberships[0] if memberships else None)

    summary = BillingSummary(member_id=member.id, member_name=member.full_name, phone=member.phone)

    if latest:
        st = effective_status(latest, today=today, grace_days=gym.grace_days)
        paid_sum = (await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.membership_id == latest.id, Payment.status == PaymentStatus.paid
            )
        )).scalar_one()
        linked = (await db.execute(
            select(func.count()).select_from(Payment).where(Payment.membership_id == latest.id)
        )).scalar_one()
        balance = latest.price - Decimal(paid_sum) if linked else Decimal(0)
        summary.membership = BillingMembership(
            id=latest.id,
            plan_name=latest.plan_name,
            end_date=latest.end_date,
            effective_status=st,
            days_overdue=max((today - latest.end_date).days, 0),
            balance_due=max(balance, Decimal(0)),
        )

        # Renovación sugerida: precio ACTUAL del plan vinculado; si el plan ya no
        # existe o está archivado, se sugiere el último precio cobrado.
        plan = None
        if latest.plan_id:
            plan = (await db.execute(
                select(MemberPlan).where(MemberPlan.id == latest.plan_id, MemberPlan.is_active.is_(True))
            )).scalar_one_or_none()
        if plan:
            summary.renewal = BillingRenewal(
                plan_id=plan.id, plan_name=plan.name,
                price=plan.price, duration_days=plan.duration_days,
            )
        else:
            summary.renewal = BillingRenewal(
                plan_id=latest.plan_id, plan_name=latest.plan_name,
                price=latest.price, duration_days=latest.duration_days,
            )

    return summary


@router.get("/{member_id}/timeline")
async def get_member_timeline(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(60, ge=1, le=200),
):
    """Actividad unificada del miembro: check-ins, pagos, membresías y reservas,
    en orden cronológico inverso — la vista CRM del perfil."""
    from app.models.tenant.checkin import CheckIn
    from app.models.tenant.payment import Payment
    from app.models.tenant.class_session import ClassSession
    from app.models.tenant.gym_class import GymClass
    from app.models.tenant.session_booking import SessionBooking

    events: list[dict] = []

    checkins = (await db.execute(
        select(CheckIn).where(CheckIn.member_id == member_id)
        .order_by(CheckIn.created_at.desc()).limit(limit)
    )).scalars().all()
    for c in checkins:
        events.append({
            "type": "checkin",
            "at": c.created_at.isoformat(),
            "decision": c.decision,
            "denial_reason": c.denial_reason,
            "source": c.source,
        })

    payments = (await db.execute(
        select(Payment).where(Payment.member_id == member_id)
        .order_by(Payment.created_at.desc()).limit(limit)
    )).scalars().all()
    for p in payments:
        events.append({
            "type": "payment",
            "at": p.created_at.isoformat(),
            "amount": str(p.amount),
            "concept": p.concept,
            "status": p.status.value,
            "method": p.method.value if p.method else None,
        })

    memberships = (await db.execute(
        select(Membership).where(Membership.member_id == member_id)
        .order_by(Membership.created_at.desc()).limit(limit)
    )).scalars().all()
    for m in memberships:
        events.append({
            "type": "membership",
            "at": m.created_at.isoformat(),
            "plan_name": m.plan_name,
            "start_date": m.start_date.isoformat(),
            "end_date": m.end_date.isoformat(),
            "price": str(m.price),
        })

    bookings = (await db.execute(
        select(SessionBooking, ClassSession, GymClass.name)
        .join(ClassSession, ClassSession.id == SessionBooking.session_id)
        .join(GymClass, GymClass.id == ClassSession.gym_class_id)
        .where(SessionBooking.member_id == member_id)
        .order_by(SessionBooking.created_at.desc()).limit(limit)
    )).all()
    for b, s, class_name in bookings:
        events.append({
            "type": "booking",
            "at": b.created_at.isoformat(),
            "class_name": class_name,
            "session_date": s.session_date.isoformat(),
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "status": b.status,
        })

    events.sort(key=lambda e: e["at"], reverse=True)
    return events[:limit]


@router.get("/missing-id-number/count")
async def count_missing_id_number(
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Cuántos miembros antiguos no tienen cédula — alimenta el banner del frontend."""
    count = (await db.execute(
        select(func.count()).select_from(Member).where(Member.id_number.is_(None))
    )).scalar_one()
    return {"count": count}


@router.get("/{member_id}/payments")
async def get_member_payments(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    from app.models.tenant.payment import Payment
    result = await db.execute(
        select(Payment).where(Payment.member_id == member_id).order_by(Payment.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{member_id}/checkins")
async def get_member_checkins(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    from app.models.tenant.checkin import CheckIn
    result = await db.execute(
        select(CheckIn).where(CheckIn.member_id == member_id).order_by(CheckIn.created_at.desc()).limit(50)
    )
    return result.scalars().all()


@router.get("/{member_id}/memberships", response_model=list[MembershipResponse])
async def get_member_memberships(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(
        select(Membership).where(Membership.member_id == member_id).order_by(Membership.start_date.desc())
    )
    memberships = result.scalars().all()
    gym = await get_gym_settings(db)
    responses = []
    for m in memberships:
        data = MembershipResponse.model_validate(m)
        data.effective_status = effective_status(m, grace_days=gym.grace_days)
        responses.append(data)
    return responses


@router.post("/{member_id}/renewal-link")
async def create_renewal_link(
    member_id: uuid.UUID,
    payload: RenewalLinkRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(get_current_staff),
    slug: str = Depends(get_tenant_slug),
):
    """Crea un pago pendiente Wompi + link, con intent de renovar la membresía
    del plan elegido cuando el pago se confirme."""
    from decimal import Decimal
    from app.models.tenant.member_plan import MemberPlan
    from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
    from app.services.payment_links import create_payment_link_for

    member = (await db.execute(select(Member).where(Member.id == member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    plan = (await db.execute(select(MemberPlan).where(MemberPlan.id == payload.plan_id))).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    payment = Payment(
        member_id=member_id,
        amount=Decimal(str(plan.price)),
        method=PaymentMethod.wompi,
        status=PaymentStatus.pending,
        concept=f"Renovación {plan.name}",
        received_by=current_user.id,
    )
    db.add(payment)
    await db.flush()
    link = await create_payment_link_for(
        db, payment, slug, member_name=member.full_name,
        membership_intent={"member_id": str(member_id), "plan_id": str(plan.id)},
    )
    await db.commit()
    await db.refresh(link)
    return {"checkout_url": link.checkout_url, "reference": link.reference, "payment_id": str(payment.id)}


_ALLOWED_PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_MAX_PHOTO_BYTES = 5 * 1024 * 1024


@router.post("/{member_id}/photo")
async def upload_member_photo(
    member_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(get_current_staff),
    slug: str = Depends(get_tenant_slug),
):
    """Sube la foto del socio a almacenamiento S3-compatible y persiste su URL."""
    from app.services.storage import upload_image

    ext = _ALLOWED_PHOTO_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Formato no soportado (usa JPG, PNG o WEBP)")
    data = await file.read()
    if len(data) > _MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="La imagen supera 5 MB")

    member = (await db.execute(select(Member).where(Member.id == member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    key = f"members/{slug}/{member_id}.{ext}"
    url = await upload_image(data, key, file.content_type)
    member.photo_url = url
    await db.commit()
    return {"photo_url": url}


@router.get("/{member_id}", response_model=MemberResponse)
async def get_member(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    return member


@router.put("/{member_id}", response_model=MemberResponse)
async def update_member(
    member_id: uuid.UUID,
    payload: MemberUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    if payload.id_number and payload.id_number != member.id_number:
        duplicate = await db.execute(
            select(Member.full_name).where(
                Member.id_number == payload.id_number, Member.id != member_id
            )
        )
        holder = duplicate.scalar_one_or_none()
        if holder:
            raise HTTPException(
                status_code=409,
                detail=f"La cédula {payload.id_number} ya está registrada a nombre de {holder}",
            )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, field, value)

    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{member_id}", status_code=204, dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def delete_member(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    await db.delete(member)
    await db.commit()
    return None
