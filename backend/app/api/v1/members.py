import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token
from app.schemas.member import MemberCreate, MemberUpdate, MemberResponse
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.membership import Membership

router = APIRouter(prefix="/members", tags=["members"])


@router.get("", response_model=list[MemberResponse])
async def list_members(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    q: str = Query("", description="Buscar por nombre o email"),
    status: MemberStatus | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(Member)
    if q:
        search = f"%{q}%"
        stmt = stmt.where(
            or_(Member.full_name.ilike(search), Member.email.ilike(search))
        )
    if status:
        stmt = stmt.where(Member.status == status)
    stmt = stmt.order_by(Member.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    members = result.scalars().all()

    # Bulk-fetch memberships for all returned members in 2 queries (no N+1)
    if members:
        member_ids = [m.id for m in members]
        today = date.today()

        # Query 1: all active memberships
        active_stmt = select(Membership).where(
            and_(
                Membership.member_id.in_(member_ids),
                Membership.end_date >= today,
                Membership.status == "active",
            )
        ).order_by(Membership.end_date.desc())
        active_result = await db.execute(active_stmt)
        active_memberships = active_result.scalars().all()
        active_map: dict = {}
        for mem in active_memberships:
            if mem.member_id not in active_map:
                active_map[mem.member_id] = mem

        # Query 2: most recent membership for members without active one (for expired status)
        without_active = [mid for mid in member_ids if mid not in active_map]
        last_map: dict = {}
        if without_active:
            last_stmt = select(Membership).where(
                Membership.member_id.in_(without_active)
            ).order_by(Membership.member_id, Membership.end_date.desc())
            last_result = await db.execute(last_stmt)
            for mem in last_result.scalars().all():
                if mem.member_id not in last_map:
                    last_map[mem.member_id] = mem

        responses = []
        for m in members:
            data = MemberResponse.model_validate(m)
            active = active_map.get(m.id)
            if active:
                data.membership_status = "active"
                data.membership_end_date = active.end_date
                data.membership_plan_name = active.plan_name
            else:
                last = last_map.get(m.id)
                if last:
                    data.membership_status = "expired"
                    data.membership_end_date = last.end_date
                    data.membership_plan_name = last.plan_name
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
    
    member = Member(**payload.model_dump())
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


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


@router.get("/{member_id}/memberships")
async def get_member_memberships(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    from app.models.tenant.membership import Membership
    result = await db.execute(
        select(Membership).where(Membership.member_id == member_id).order_by(Membership.start_date.desc())
    )
    return result.scalars().all()


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
