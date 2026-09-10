import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_slug, require_perm
from app.core import permissions as perm
from app.core.timeutil import today_bogota
from app.models.tenant.day_pass import DayPass, DayPassType
from app.models.tenant.member import Member
from app.models.tenant.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant.user_staff import UserStaff
from app.schemas.day_pass import (
    DayPassTypeCreate, DayPassTypeUpdate, DayPassTypeResponse,
    DayPassSell, DayPassResponse, DayPassSellResponse,
)
from app.services.audit import audit
from app.services.day_passes import find_or_create_visitor, sell_day_pass
from app.services.gym_settings import get_gym_settings
from app.services.payment_links import create_payment_link_for
from app.services.payments import public_account
from app.services.receipts import issue_receipt

router = APIRouter(prefix="/day-passes", tags=["day-passes"], dependencies=[Depends(get_current_staff)])


# ─── Tipos de pase (catálogo del gym) ─────────────────────────────────────────

@router.get("/types", response_model=list[DayPassTypeResponse])
async def list_pass_types(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    include_inactive: bool = Query(False),
):
    stmt = select(DayPassType)
    if not include_inactive:
        stmt = stmt.where(DayPassType.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(DayPassType.sort_order, DayPassType.name))).scalars().all()
    return rows


@router.post("/types", response_model=DayPassTypeResponse, status_code=201,
             dependencies=[Depends(require_perm(perm.DAY_PASSES_WRITE))])
async def create_pass_type(
    payload: DayPassTypeCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    row = DayPassType(**payload.model_dump())
    db.add(row)
    await db.flush()
    audit(db, current_user, "day_pass_type.create", "day_pass_type", row.id, {"name": row.name, "price": str(row.price)})
    await db.commit()
    await db.refresh(row)
    return row


@router.put("/types/{type_id}", response_model=DayPassTypeResponse,
            dependencies=[Depends(require_perm(perm.DAY_PASSES_WRITE))])
async def update_pass_type(
    type_id: uuid.UUID,
    payload: DayPassTypeUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    row = (await db.execute(select(DayPassType).where(DayPassType.id == type_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Tipo de pase no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/types/{type_id}", dependencies=[Depends(require_perm(perm.DAY_PASSES_WRITE))])
async def archive_pass_type(
    type_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Archiva (los pases ya vendidos conservan su snapshot)."""
    row = (await db.execute(select(DayPassType).where(DayPassType.id == type_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Tipo de pase no encontrado")
    row.is_active = False
    await db.commit()
    return {"archived": True}


# ─── Venta y consulta ─────────────────────────────────────────────────────────

def _pass_response(dp: DayPass, member: Member | None, payment: Payment | None) -> DayPassResponse:
    data = DayPassResponse.model_validate(dp)
    if member:
        data.member_name = member.full_name
        data.member_id_number = member.id_number
    if payment:
        data.payment_method = payment.method.value if payment.method else None
        data.payment_status = payment.status.value
    return data


@router.post("/sell", response_model=DayPassSellResponse, status_code=201, dependencies=[Depends(require_perm(perm.DAY_PASSES_SELL))])
async def sell(
    payload: DayPassSell,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    slug: str = Depends(get_tenant_slug),
):
    """Registro exprés + venta del pase de hoy. cash/card: pagado y activo al
    instante. transfer: pendiente con referencia y cuenta destino. wompi:
    pendiente con link de pago."""
    pass_type = (await db.execute(
        select(DayPassType).where(DayPassType.id == payload.pass_type_id)
    )).scalar_one_or_none()
    if not pass_type:
        raise HTTPException(status_code=404, detail="Tipo de pase no encontrado")

    gym = await get_gym_settings(db)
    member, is_new = await find_or_create_visitor(db, payload.id_number, payload.full_name, payload.phone)
    day_pass, payment, account = await sell_day_pass(
        db, gym=gym, member=member, pass_type=pass_type, method=payload.method,
        received_by=current_user.id,
        transfer_account_id=payload.transfer_account_id,
        card_approval_code=payload.card_approval_code,
        card_terminal=payload.card_terminal,
    )

    receipt_number = None
    checkout_url = None
    if payment.status == PaymentStatus.paid:
        receipt = await issue_receipt(db, payment)
        receipt_number = receipt.snapshot.get("receipt_number")
    elif payment.method == PaymentMethod.wompi:
        link = await create_payment_link_for(db, payment, slug, member_name=member.full_name)
        checkout_url = link.checkout_url

    audit(db, current_user, "day_pass.sell", "day_pass", day_pass.id, {
        "member_id": str(member.id), "member_name": member.full_name, "is_new_visitor": is_new,
        "pass_name": pass_type.name, "price": str(payment.amount),
        "method": payment.method.value if payment.method else None, "payment_status": payment.status.value,
    })
    await db.commit()
    await db.refresh(day_pass)
    await db.refresh(payment)
    return DayPassSellResponse(
        day_pass=_pass_response(day_pass, member, payment),
        payment_id=payment.id,
        payment_status=payment.status.value,
        member_id=member.id,
        is_new_visitor=is_new,
        receipt_number=receipt_number,
        transfer_reference=payment.transfer_reference,
        destination_account=public_account(account),
        checkout_url=checkout_url,
    )


@router.get("", response_model=list[DayPassResponse])
async def list_day_passes(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    on: date | None = Query(None, alias="date"),
    limit: int = Query(100, ge=1, le=500),
):
    """Pases de un día (por defecto hoy), con socio y estado del pago."""
    day = on or today_bogota()
    rows = (await db.execute(
        select(DayPass, Member, Payment)
        .join(Member, Member.id == DayPass.member_id)
        .outerjoin(Payment, Payment.id == DayPass.payment_id)
        .where(DayPass.valid_on == day)
        .order_by(desc(DayPass.created_at))
        .limit(limit)
    )).all()
    return [_pass_response(dp, m, p) for dp, m, p in rows]


@router.get("/summary")
async def day_passes_summary(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    on: date | None = Query(None, alias="date"),
):
    day = on or today_bogota()
    rows = (await db.execute(
        select(DayPass.status, func.count(), func.coalesce(func.sum(DayPass.price), 0))
        .where(DayPass.valid_on == day)
        .group_by(DayPass.status)
    )).all()
    by_status = {st: {"count": n, "amount": float(a)} for st, n, a in rows}
    return {
        "date": day.isoformat(),
        "active": by_status.get("active", {"count": 0, "amount": 0.0}),
        "pending": by_status.get("pending", {"count": 0, "amount": 0.0}),
        "void": by_status.get("void", {"count": 0, "amount": 0.0}),
    }
