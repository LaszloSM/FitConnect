import uuid
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.api.deps import get_tenant_db_from_token, require_perm
from app.core import permissions as perm
from app.models.tenant.audit_log import AuditLog

router = APIRouter(
    prefix="/audit",
    tags=["audit"],
    dependencies=[Depends(require_perm(perm.AUDIT_READ))],
)


@router.get("")
async def list_audit_logs(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    action: str | None = Query(None, max_length=100),
    actor_staff_id: uuid.UUID | None = Query(None),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    stmt = select(AuditLog)
    count_stmt = select(func.count()).select_from(AuditLog)

    filters = []
    if action:
        filters.append(AuditLog.action.startswith(action))
    if actor_staff_id:
        filters.append(AuditLog.actor_staff_id == actor_staff_id)
    if date_from:
        filters.append(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        filters.append(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if filters:
        stmt = stmt.where(*filters)
        count_stmt = count_stmt.where(*filters)

    total = (await db.execute(count_stmt)).scalar() or 0
    rows = (await db.execute(
        stmt.order_by(desc(AuditLog.created_at)).limit(limit).offset(offset)
    )).scalars().all()
    return {"total": total, "items": rows}


@router.get("/entity/{entity_type}/{entity_id}")
async def entity_history(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(100, ge=1, le=200),
):
    """Historial de una entidad concreta: "qué le pasó a este pago".

    La auditoría solo se podía recorrer en orden cronológico, así que servía para
    cumplir y no para responder la pregunta que el dueño hace de verdad.
    """
    rows = (await db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
    )).scalars().all()
    return {"total": len(rows), "items": rows}
