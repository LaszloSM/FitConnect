import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_from_claims, require_perm
from app.core import permissions as perm
from app.core.timeutil import now_bogota, utcnow_naive
from app.models.master.tenant import Tenant
from app.models.tenant.announcement import Announcement
from app.models.tenant.member import Member
from app.models.tenant.message_template import MessageTemplate
from app.models.tenant.notification_outbox import NotificationOutbox
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.events import emit_announcement
from app.services.gym_settings import get_gym_settings
from app.services.idempotency import Idempotent
from app.services.message_occasions import EDITABLE, OCCASIONS, SAMPLE_VALUES
from app.services import push
from app.services.message_templates import get_or_seed_templates, render
from app.services.segments import SEGMENTS, resolve_members

router = APIRouter(prefix="/messages", tags=["messages"], dependencies=[Depends(get_current_staff)])


# ─────────────────────────── Mensajes automáticos ───────────────────────────

class MessageOut(BaseModel):
    occasion: str
    label: str
    description: str
    variables: list[str]
    body: str
    is_active: bool
    whatsapp: bool
    """Nombre de la plantilla que el gym tiene aprobada en su WhatsApp Business."""
    meta_template_name: str | None


class MessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    is_active: bool = True
    meta_template_name: str | None = Field(default=None, max_length=100)


def _to_out(t: MessageTemplate) -> MessageOut:
    occ = OCCASIONS[t.occasion]
    return MessageOut(
        occasion=t.occasion,
        label=occ.label,
        description=occ.description,
        variables=occ.variables,
        body=t.body,
        is_active=t.is_active,
        whatsapp=occ.whatsapp,
        meta_template_name=t.meta_template_name or occ.default_meta_template,
    )


@router.get("", response_model=list[MessageOut])
async def list_messages(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _=Depends(require_perm(perm.MESSAGES_READ)),
):
    """Los mensajes automáticos del gym, sembrando los defaults la primera vez."""
    editable = {o.key for o in EDITABLE}
    return [_to_out(t) for t in await get_or_seed_templates(db) if t.occasion in editable]


# ─────────────────────────── Anuncios ───────────────────────────

class SegmentOut(BaseModel):
    key: str
    label: str
    description: str
    param: str | None


@router.get("/segments", response_model=list[SegmentOut])
async def list_segments(_=Depends(require_perm(perm.MESSAGES_READ))):
    return [SegmentOut(**vars(s)) for s in SEGMENTS.values()]


class AudienceRequest(BaseModel):
    segment: str
    segment_params: dict | None = None


@router.post("/announcements/audience")
async def preview_audience(
    payload: AudienceRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _=Depends(require_perm(perm.MESSAGES_READ)),
):
    """A cuántos —y a quiénes— les va a llegar. Enviar a ciegas es un incidente."""
    try:
        members = await resolve_members(db, payload.segment, payload.segment_params)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    con_whatsapp = sum(1 for m in members if m.phone)
    return {
        "total": len(members),
        "with_phone": con_whatsapp,
        "without_phone": len(members) - con_whatsapp,
        "sample": [
            {"id": str(m.id), "full_name": m.full_name, "phone": m.phone}
            for m in members[:10]
        ],
    }


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=3, max_length=2000)
    segment: str
    segment_params: dict | None = None
    """Para que además salga por WhatsApp: nombre de la plantilla aprobada."""
    meta_template_name: str | None = Field(default=None, max_length=100)


class AnnouncementOut(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    segment: str
    segment_label: str
    recipients: int
    meta_template_name: str | None
    sent_at: datetime | None
    sent_by_name: str

    class Config:
        from_attributes = True


def _announcement_out(a: Announcement) -> AnnouncementOut:
    seg = SEGMENTS.get(a.segment)
    return AnnouncementOut(
        id=a.id, title=a.title, body=a.body, segment=a.segment,
        segment_label=seg.label if seg else a.segment,
        recipients=a.recipients, meta_template_name=a.meta_template_name,
        sent_at=a.sent_at, sent_by_name=a.sent_by_name,
    )


@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(30, ge=1, le=100),
    _=Depends(require_perm(perm.MESSAGES_READ)),
):
    rows = (await db.execute(
        select(Announcement).order_by(desc(Announcement.created_at)).limit(limit)
    )).scalars().all()
    return [_announcement_out(a) for a in rows]


@router.post("/announcements", response_model=AnnouncementOut, status_code=201)
async def send_announcement(
    payload: AnnouncementCreate,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.MESSAGES_SEND)),
    tenant: Tenant = Depends(get_tenant_from_claims),
):
    """Encola el anuncio para el segmento elegido.

    Idempotente: un doble clic en "Enviar" mandaría el mensaje dos veces a todo
    el gym, que es de las pocas cosas imposibles de deshacer.
    """
    guard = Idempotent(db, request, "messages.announcement", payload.model_dump())
    replay = await guard.check()
    if replay is not None:
        return replay

    try:
        members = await resolve_members(db, payload.segment, payload.segment_params)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not members:
        raise HTTPException(status_code=400, detail="Ese segmento no tiene socios ahora mismo")

    gym = await get_gym_settings(db)
    gym_name = getattr(gym, "legal_name", None) or tenant.name

    announcement = Announcement(
        title=payload.title, body=payload.body, segment=payload.segment,
        segment_params=payload.segment_params, meta_template_name=payload.meta_template_name,
        recipients=len(members), sent_at=utcnow_naive(),
        sent_by=current_user.id, sent_by_name=current_user.full_name,
    )
    db.add(announcement)
    await db.flush()

    for m in members:
        values = {"nombre": m.full_name.split(" ")[0], "gym": gym_name}
        await emit_announcement(
            db,
            idempotency_key=f"ann:{announcement.id}:{m.id}",
            title=payload.title,
            message=render(payload.body, values),
            member_id=m.id,
            phone=m.phone,
            meta_template=payload.meta_template_name,
            params=[values["nombre"], values["gym"]],
        )

    audit(db, current_user, "announcement.send", "announcement", announcement.id, {
        "title": payload.title, "segment": payload.segment, "recipients": len(members),
        "whatsapp": bool(payload.meta_template_name),
    })
    response = _announcement_out(announcement)
    guard.remember(response, 201)
    won = await guard.commit()
    if won is None:
        # Quien tiene la app lo ve también como aviso en el celular.
        background.add_task(push.notify_members, tenant.db_name, [m.id for m in members], gym_name,
                            payload.title, {"type": "announcement", "id": str(announcement.id)})
    return won if won is not None else response


# ─────────────────────────── Mensaje a un socio ───────────────────────────

class DirectMessage(BaseModel):
    member_id: uuid.UUID
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=3, max_length=2000)
    meta_template_name: str | None = Field(default=None, max_length=100)


@router.post("/send", status_code=201)
async def send_direct(
    payload: DirectMessage,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.MESSAGES_SEND)),
    tenant: Tenant = Depends(get_tenant_from_claims),
):
    """Un mensaje puntual a un socio desde su ficha."""
    guard = Idempotent(db, request, "messages.direct", payload.model_dump())
    replay = await guard.check()
    if replay is not None:
        return replay

    member = (await db.execute(select(Member).where(Member.id == payload.member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    gym = await get_gym_settings(db)
    gym_name = getattr(gym, "legal_name", None) or tenant.name
    values = {"nombre": member.full_name.split(" ")[0], "gym": gym_name}

    await emit_announcement(
        db,
        idempotency_key=f"direct:{uuid.uuid4().hex}",
        title=payload.title,
        message=render(payload.body, values),
        member_id=member.id,
        phone=member.phone,
        meta_template=payload.meta_template_name,
        params=[values["nombre"], values["gym"]],
    )
    audit(db, current_user, "message.send", "member", member.id, {"title": payload.title})

    response = {"sent": True, "member_id": str(member.id), "has_phone": bool(member.phone)}
    guard.remember(response, 201)
    won = await guard.commit()
    return won if won is not None else response


# ─────────────────────────── Envíos ───────────────────────────

class OutboxOut(BaseModel):
    id: uuid.UUID
    event_type: str
    channel: str
    recipient_phone: str | None
    member_id: uuid.UUID | None
    member_name: str | None
    template_name: str | None
    status: str
    attempts: int
    last_error: str | None
    scheduled_for: datetime
    sent_at: datetime | None


@router.get("/outbox", response_model=list[OutboxOut])
async def list_outbox(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    status: str | None = Query(None, pattern="^(pending|sent|failed|skipped)$"),
    limit: int = Query(100, ge=1, le=200),
    _=Depends(require_perm(perm.MESSAGES_READ)),
):
    """Qué salió, qué falló y qué se saltó.

    El endpoint existía desde hacía meses y ninguna pantalla lo consumía: el
    gimnasio no tenía forma de responder "¿le llegó el WhatsApp a Juan?".
    """
    stmt = select(NotificationOutbox).where(NotificationOutbox.channel == "whatsapp")
    if status:
        stmt = stmt.where(NotificationOutbox.status == status)
    rows = (await db.execute(
        stmt.order_by(desc(NotificationOutbox.created_at)).limit(limit)
    )).scalars().all()

    ids = {r.member_id for r in rows if r.member_id}
    names: dict[uuid.UUID, str] = {}
    if ids:
        names = {
            m_id: name
            for m_id, name in (await db.execute(
                select(Member.id, Member.full_name).where(Member.id.in_(ids))
            )).all()
        }
    return [
        OutboxOut(
            id=r.id, event_type=r.event_type, channel=r.channel,
            recipient_phone=r.recipient_phone, member_id=r.member_id,
            member_name=names.get(r.member_id) if r.member_id else None,
            template_name=r.template_name, status=r.status, attempts=r.attempts,
            last_error=r.last_error, scheduled_for=r.scheduled_for, sent_at=r.sent_at,
        )
        for r in rows
    ]


@router.post("/outbox/{outbox_id}/retry", response_model=OutboxOut)
async def retry_outbox(
    outbox_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.MESSAGES_SEND)),
):
    """Devuelve a la cola un envío fallido o saltado, sin esperar al job."""
    item = (await db.execute(
        select(NotificationOutbox).where(NotificationOutbox.id == outbox_id)
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Envío no encontrado")
    if item.status not in ("failed", "skipped"):
        raise HTTPException(status_code=400, detail=f"Solo se reintenta lo fallido o saltado (está {item.status})")
    if not item.recipient_phone:
        raise HTTPException(status_code=400, detail="Este envío no tiene teléfono al que reintentar")

    item.status = "pending"
    item.attempts = 0
    item.last_error = None
    item.scheduled_for = now_bogota()
    audit(db, current_user, "message.retry", "notification_outbox", item.id, {
        "event_type": item.event_type, "phone": item.recipient_phone,
    })
    await db.commit()
    await db.refresh(item)
    return OutboxOut(
        id=item.id, event_type=item.event_type, channel=item.channel,
        recipient_phone=item.recipient_phone, member_id=item.member_id, member_name=None,
        template_name=item.template_name, status=item.status, attempts=item.attempts,
        last_error=item.last_error, scheduled_for=item.scheduled_for, sent_at=item.sent_at,
    )


# Las rutas con parámetro de path van AL FINAL: FastAPI resuelve en orden de
# declaración y `/{occasion}` se comería cualquier ruta fija que se agregue
# después (`/segments`, `/announcements`, `/send`, `/outbox`).
@router.put("/{occasion}", response_model=MessageOut)
async def update_message(
    occasion: str,
    payload: MessageUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(require_perm(perm.MESSAGES_WRITE)),
):
    if occasion not in OCCASIONS or occasion == "announcement":
        raise HTTPException(status_code=404, detail="Ocasión desconocida")
    await get_or_seed_templates(db)
    t = (await db.execute(
        select(MessageTemplate).where(MessageTemplate.occasion == occasion)
    )).scalar_one()
    t.body = payload.body
    t.is_active = payload.is_active
    t.meta_template_name = payload.meta_template_name or None
    audit(db, current_user, "message.update", "message_template", t.id, {
        "occasion": occasion, "is_active": payload.is_active,
        "meta_template_name": t.meta_template_name,
    })
    await db.commit()
    await db.refresh(t)
    return _to_out(t)


class PreviewRequest(BaseModel):
    body: str


@router.post("/{occasion}/preview")
async def preview_message(
    occasion: str,
    payload: PreviewRequest,
    _=Depends(require_perm(perm.MESSAGES_READ)),
):
    """Previsualiza el mensaje con valores de ejemplo para cada variable."""
    if occasion not in OCCASIONS:
        raise HTTPException(status_code=404, detail="Ocasión desconocida")
    return {"preview": render(payload.body, SAMPLE_VALUES)}
