from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db_from_token, require_role, get_current_staff
from app.models.tenant.message_template import MessageTemplate
from app.models.tenant.user_staff import UserRole
from app.services.message_templates import CATALOG, get_or_seed_templates, render

router = APIRouter(prefix="/messages", tags=["messages"], dependencies=[Depends(get_current_staff)])


class MessageOut(BaseModel):
    occasion: str
    label: str
    variables: list[str]
    body: str
    header_image_url: str | None
    is_active: bool
    meta_status: str


class MessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    is_active: bool = True
    header_image_url: str | None = None


def _to_out(t: MessageTemplate) -> MessageOut:
    meta = CATALOG.get(t.occasion, {"label": t.occasion, "variables": []})
    return MessageOut(
        occasion=t.occasion,
        label=meta["label"],
        variables=meta["variables"],
        body=t.body,
        header_image_url=t.header_image_url,
        is_active=t.is_active,
        meta_status=t.meta_status,
    )


@router.get("", response_model=list[MessageOut])
async def list_messages(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _=Depends(require_role(UserRole.owner, UserRole.admin)),
):
    """Mensajes editables del gym, sembrando los defaults la primera vez."""
    return [_to_out(t) for t in await get_or_seed_templates(db)]


@router.put("/{occasion}", response_model=MessageOut)
async def update_message(
    occasion: str,
    payload: MessageUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _=Depends(require_role(UserRole.owner, UserRole.admin)),
):
    if occasion not in CATALOG:
        raise HTTPException(status_code=404, detail="Ocasión desconocida")
    await get_or_seed_templates(db)  # asegura que exista
    t = (await db.execute(
        select(MessageTemplate).where(MessageTemplate.occasion == occasion)
    )).scalar_one()
    body_changed = t.body != payload.body or t.header_image_url != payload.header_image_url
    t.body = payload.body
    t.is_active = payload.is_active
    t.header_image_url = payload.header_image_url
    # Si cambia el contenido, vuelve a 'draft': WhatsApp exige re-aprobar en Meta.
    if body_changed:
        t.meta_status = "draft"
    await db.commit()
    await db.refresh(t)
    return _to_out(t)


class PreviewRequest(BaseModel):
    body: str


@router.post("/{occasion}/preview")
async def preview_message(
    occasion: str,
    payload: PreviewRequest,
    _=Depends(require_role(UserRole.owner, UserRole.admin)),
):
    """Previsualiza el mensaje con valores de ejemplo para cada variable."""
    if occasion not in CATALOG:
        raise HTTPException(status_code=404, detail="Ocasión desconocida")
    samples = {
        "nombre": "María", "plan": "Mensual", "fecha": "30/06/2026",
        "link": "https://pago.fitconnect.co/abc", "gym": "Tu Gimnasio",
    }
    return {"preview": render(payload.body, samples)}
