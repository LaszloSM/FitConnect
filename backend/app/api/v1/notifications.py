import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.api.deps import get_tenant_db_from_token, require_role
from app.schemas.operations import NotificationCreate, NotificationResponse
from app.models.tenant.notification import Notification
from app.models.tenant.notification_outbox import NotificationOutbox
from app.models.tenant.user_staff import UserRole

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/outbox", dependencies=[Depends(require_role(UserRole.owner))])
async def list_outbox(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(50, ge=1, le=200),
):
    """Log de envíos externos (WhatsApp) con su estado — solo owner."""
    rows = (await db.execute(
        select(NotificationOutbox)
        .where(NotificationOutbox.channel == "whatsapp")
        .order_by(desc(NotificationOutbox.created_at))
        .limit(limit)
    )).scalars().all()
    return [
        {
            "id": str(o.id), "event_type": o.event_type, "recipient_phone": o.recipient_phone,
            "member_id": str(o.member_id) if o.member_id else None,
            "template_name": o.template_name, "template_params": o.template_params,
            "status": o.status, "attempts": o.attempts, "last_error": o.last_error,
            "created_at": o.created_at, "sent_at": o.sent_at,
        }
        for o in rows
    ]


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(Notification)
    if unread_only:
        stmt = stmt.where(Notification.is_read == False)
    stmt = stmt.order_by(desc(Notification.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=NotificationResponse, status_code=201)
async def create_notification(
    payload: NotificationCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    notification = Notification(**payload.model_dump())
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notificacion no encontrada")
    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification


@router.post("/mark-all-read")
async def mark_all_read(
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Notification).where(Notification.is_read == False))
    notifications = result.scalars().all()
    for n in notifications:
        n.is_read = True
    await db.commit()
    return {"marked_as_read": len(notifications)}
