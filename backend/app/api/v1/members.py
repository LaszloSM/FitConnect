import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_slug
from app.schemas.member import MemberCreate, MemberUpdate, MemberResponse, MembershipResponse
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.membership import Membership
from app.core.timeutil import today_bogota
from app.services.gym_settings import get_gym_settings
from app.services.membership_status import effective_status

router = APIRouter(prefix="/members", tags=["members"])


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


@router.delete("/{member_id}", status_code=204)
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
