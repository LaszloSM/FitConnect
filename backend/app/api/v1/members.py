import json
import uuid
from typing import Literal
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, delete
from decimal import Decimal

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_slug, require_perm, get_tenant_from_claims
from app.core import permissions as perm
from app.models.master.tenant import Tenant
from app.schemas.member import MemberCreate, MemberUpdate, MemberResponse, MembershipResponse, ConsentUpdate
from app.models.tenant.member import Member, MemberStatus
from app.models.tenant.membership import Membership
from app.models.tenant.payment import Payment
from app.services.payment_ledger import net_amount
from app.models.tenant.checkin import CheckIn
from app.models.tenant.class_enrollment import ClassEnrollment
from app.models.tenant.session_booking import SessionBooking
from app.models.tenant.routine import MemberRoutine
from app.models.tenant.day_pass import DayPass
from app.models.tenant.user_staff import UserRole, UserStaff
from app.models.tenant.instructor import Instructor
from app.models.tenant.import_batch import ImportBatch
from sqlalchemy.exc import IntegrityError
from app.core.timeutil import today_bogota
from app.services.gym_settings import get_gym_settings
from app.services.membership_status import effective_status
from app.services import member_import, member_profile
from app.services.audit import audit
from app.services.idempotency import Idempotent
from app.services.storage import resolve_media_url, delete_object, scoped_key

# Todo /members exige staff activo; el borrado además exige owner/admin.
router = APIRouter(prefix="/members", tags=["members"], dependencies=[Depends(require_perm(perm.MEMBERS_READ))])


class RenewalLinkRequest(BaseModel):
    plan_id: uuid.UUID


async def trainer_scope(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    staff: UserStaff = Depends(get_current_staff),
) -> uuid.UUID | None:
    """Para un entrenador, el id de su ficha; para los demás roles, None.

    `MEMBERS_READ` le deja abrir el módulo, pero "sus socios" tiene que ser
    verdad también aquí: sin esto un entrenador listaba el gimnasio entero con
    teléfonos incluidos. Un entrenador sin ficha enlazada no ve a nadie, que es
    la respuesta segura.
    """
    if staff.role != UserRole.trainer:
        return None
    ficha = (await db.execute(
        select(Instructor.id).where(Instructor.staff_id == staff.id)
    )).scalar_one_or_none()
    return ficha or uuid.UUID(int=0)


async def ensure_member_visible(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    solo_mios: uuid.UUID | None = Depends(trainer_scope),
) -> None:
    """Las subrutas de la ficha heredan `MEMBERS_READ` del router: sin esto un
    entrenador leía el historial de CUALQUIER socio poniendo su id en la URL."""
    if solo_mios is None:
        return
    visible = (await db.execute(
        select(Member.id).where(Member.id == member_id, Member.trainer_id == solo_mios)
    )).scalar_one_or_none()
    if not visible:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")


@router.get("", response_model=list[MemberResponse])
async def list_members(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    q: str = Query("", description="Buscar por nombre, email o cédula"),
    status: MemberStatus | None = Query(None),
    missing_id_number: bool = Query(False, description="Solo miembros sin cédula registrada"),
    id_number: str | None = Query(None, description="Cédula exacta (lookup del pase del día)"),
    member_type: str | None = Query(None, description="member | visitor"),
    incomplete: bool = Query(False, description="Solo fichas a las que les falta algo obligatorio"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    solo_mios: uuid.UUID | None = Depends(trainer_scope),
):
    stmt = select(Member)
    if solo_mios is not None:
        stmt = stmt.where(Member.trainer_id == solo_mios)
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
    if id_number:
        stmt = stmt.where(Member.id_number == id_number.strip())
    if member_type:
        stmt = stmt.where(Member.member_type == member_type)
    if incomplete:
        # Mismo criterio que el contador (profile-summary): solo socios, no personal ni visitantes.
        stmt = stmt.where(Member.member_type == "member", member_profile.incomplete_condition())
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


@router.post("", response_model=MemberResponse, status_code=201, dependencies=[Depends(require_perm(perm.MEMBERS_WRITE))])
async def create_member(
    payload: MemberCreate,
    request: Request,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    slug: str = Depends(get_tenant_slug),
    tenant: Tenant = Depends(get_tenant_from_claims),
):
    # El alta hecha sin conexión se reenvía con la misma clave al volver la red:
    # si la primera sí llegó, se devuelve ese socio en vez de un 409 de cédula.
    guard = Idempotent(db, request, "members.create", payload.model_dump(mode="json"))
    replay = await guard.check()
    if replay is not None:
        return replay

    if payload.email:
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

    # Separar los campos de membresía y consentimiento del payload del miembro
    member_data = payload.model_dump(exclude={"plan_id", "payment_method", "consent_data", "consent_image"})
    if not member_data.get("parq_completed_at"):
        member_data["parq_completed_at"] = today_bogota()
    member_data["photo_url"] = scoped_key(member_data.get("photo_url"), f"members/{slug}/")
    member = Member(**member_data)
    from app.core.timeutil import utcnow_naive
    member.consent_data_at = utcnow_naive()
    if payload.consent_image:
        member.consent_image_at = utcnow_naive()
    db.add(member)
    await db.flush()  # obtener member.id sin cerrar la transacción

    from app.models.tenant.member_plan import MemberPlan
    from app.api.v1.member_plans import _create_membership

    plan_result = await db.execute(
        select(MemberPlan).where(MemberPlan.id == payload.plan_id)
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    # La membresía del alta inicia siempre hoy (fecha de creación del socio)
    await _create_membership(
        db,
        member.id,
        plan,
        today_bogota(),
        payload.payment_method,
    )

    # La ocasión "bienvenida" existía en el catálogo, se podía editar desde la
    # pantalla de Mensajes... y no la emitía nadie.
    from app.services.events import try_emit_occasion
    from app.services.gym_settings import get_gym_settings

    gym = await get_gym_settings(db)
    await try_emit_occasion(
        db, "welcome",
        idempotency_key=f"welcome:{member.id}",
        values={
            "nombre": member.full_name.split(" ")[0],
            "gym": getattr(gym, "legal_name", None) or tenant.name,
        },
        member_id=member.id, phone=member.phone,
    )

    await db.flush()
    await db.refresh(member)
    response = MemberResponse.model_validate(member).model_dump(mode="json")
    guard.remember(response, 201)
    won = await guard.commit()
    return won if won is not None else response


@router.post("/{member_id}/convert-to-member", response_model=MemberResponse, dependencies=[Depends(require_perm(perm.MEMBERS_WRITE))])
async def convert_visitor_to_member(
    member_id: uuid.UUID,
    payload: MemberCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(get_current_staff),
    slug: str = Depends(get_tenant_slug),
):
    """Un visitante del pase del día completa el alta (datos, salud, plan) y
    pasa a ser socio conservando su cédula, pases y pagos."""
    member = (await db.execute(select(Member).where(Member.id == member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    if member.member_type != "visitor":
        raise HTTPException(status_code=400, detail="Este registro ya es un socio")
    if payload.id_number != member.id_number:
        dup = (await db.execute(
            select(Member.full_name).where(Member.id_number == payload.id_number, Member.id != member_id)
        )).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=409, detail=f"La cédula {payload.id_number} ya está registrada a nombre de {dup}")
    if payload.email:
        dup_email = (await db.execute(
            select(Member.id).where(Member.email == payload.email, Member.id != member_id)
        )).scalar_one_or_none()
        if dup_email:
            raise HTTPException(status_code=400, detail="Email ya registrado")

    member_data = payload.model_dump(exclude={"plan_id", "payment_method", "consent_data", "consent_image"})
    if not member_data.get("parq_completed_at"):
        member_data["parq_completed_at"] = today_bogota()
    member_data["photo_url"] = scoped_key(member_data.get("photo_url"), f"members/{slug}/") or member.photo_url
    for field, value in member_data.items():
        setattr(member, field, value)
    from app.core.timeutil import utcnow_naive
    member.consent_data_at = utcnow_naive()
    if payload.consent_image:
        member.consent_image_at = utcnow_naive()
    member.member_type = "member"
    member.status = MemberStatus.active
    await db.flush()

    from app.models.tenant.member_plan import MemberPlan
    from app.api.v1.member_plans import _create_membership
    from app.services.audit import audit
    from app.services.membership_status import next_chain_start
    plan = (await db.execute(select(MemberPlan).where(MemberPlan.id == payload.plan_id))).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    gym = await get_gym_settings(db)
    today = today_bogota()
    start = await next_chain_start(db, member.id, gym.grace_days, today, today=today)
    await _create_membership(db, member.id, plan, start, payload.payment_method)
    audit(db, current_user, "member.convert", "member", member.id, {
        "member_name": member.full_name, "plan_name": plan.name,
    })
    await db.commit()
    await db.refresh(member)
    return member


@router.get("/import/template.xlsx", dependencies=[Depends(require_perm(perm.MEMBERS_IMPORT))])
async def download_import_template():
    return Response(
        content=member_import.build_template(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="plantilla_socios.xlsx"'},
    )


async def _read_import_file(file: UploadFile) -> bytes:
    # Por trozos: un archivo enorme se corta apenas pasa el límite, sin cargarlo entero.
    data = bytearray()
    while chunk := await file.read(1024 * 1024):
        data.extend(chunk)
        if len(data) > member_import.MAX_BYTES:
            raise HTTPException(status_code=413, detail="El archivo supera 5 MB. Divídelo en partes.")
    if not data:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    return bytes(data)


def _import_options(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Opciones de importación inválidas")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Opciones de importación inválidas")
    return parsed


@router.post("/import/preview", dependencies=[Depends(require_perm(perm.MEMBERS_IMPORT))])
async def preview_import(
    file: UploadFile = File(...),
    options: str | None = Form(None),
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Analiza el archivo sin guardar nada: columnas detectadas, qué pasará con
    cada persona y qué falta resolver (planes o entrenadores que no existen)."""
    data = await _read_import_file(file)
    try:
        return await member_import.preview(db, data, file.filename, _import_options(options))
    except member_import.ImportFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


async def _apply_import(db, staff, file: UploadFile, options: dict | None) -> dict:
    data = await _read_import_file(file)
    try:
        result = await member_import.apply(db, data, file.filename, options, staff.id)
    except member_import.ImportFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit(db, staff, "member_import.apply", "import_batch", result["batch_id"], {
        "file": file.filename, **{k: result["summary"][k] for k in ("create", "update", "memberships", "error")},
    })
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Alguien registró uno de estos socios mientras se importaba. Vuelve a generar la vista previa.",
        )
    return result


@router.post("/import/commit", dependencies=[Depends(require_perm(perm.MEMBERS_IMPORT))])
async def commit_import(
    file: UploadFile = File(...),
    options: str | None = Form(None),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    staff: UserStaff = Depends(get_current_staff),
):
    return await _apply_import(db, staff, file, _import_options(options))


@router.post("/import", dependencies=[Depends(require_perm(perm.MEMBERS_IMPORT))])
async def import_members_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    staff: UserStaff = Depends(get_current_staff),
):
    """Importación en un paso con el mapeo automático (compatibilidad)."""
    result = await _apply_import(db, staff, file, None)
    return {
        "created": result["summary"]["create"],
        "updated": result["summary"]["update"],
        "batch_id": result["batch_id"],
        "errors": result["errors"],
    }


@router.get("/import/batches", dependencies=[Depends(require_perm(perm.MEMBERS_IMPORT))])
async def list_import_batches(db: AsyncSession = Depends(get_tenant_db_from_token)):
    rows = (await db.execute(
        select(ImportBatch, UserStaff.full_name)
        .outerjoin(UserStaff, UserStaff.id == ImportBatch.created_by)
        .order_by(ImportBatch.created_at.desc())
        .limit(20)
    )).all()
    return [
        {
            "id": str(b.id),
            "file_name": b.file_name,
            "status": b.status,
            "created_at": b.created_at.isoformat(),
            "created_by": name,
            "undone_at": b.undone_at.isoformat() if b.undone_at else None,
            "counts": {k: v for k, v in (b.counts or {}).items() if k != "errors"},
        }
        for b, name in rows
    ]


@router.post("/import/batches/{batch_id}/undo", dependencies=[Depends(require_perm(perm.MEMBERS_IMPORT))])
async def undo_import_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    staff: UserStaff = Depends(get_current_staff),
):
    # Bloqueo de fila: dos "deshacer" simultáneos no pueden revertir el mismo lote dos veces.
    batch = await db.get(ImportBatch, batch_id, with_for_update=True)
    if batch is None:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    try:
        result = await member_import.undo(db, batch, staff.id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    audit(db, staff, "member_import.undo", "import_batch", batch.id, result)
    await db.commit()
    return result


@router.get("/{member_id}/billing-summary", dependencies=[
    Depends(require_perm(perm.MEMBER_MONEY_READ)), Depends(ensure_member_visible)])
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
            select(func.coalesce(func.sum(net_amount()), 0)).where(
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


@router.get("/{member_id}/timeline", dependencies=[Depends(ensure_member_visible)])
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


@router.get("/{member_id}/payments", dependencies=[
    Depends(require_perm(perm.MEMBER_MONEY_READ)), Depends(ensure_member_visible)])
async def get_member_payments(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    from app.models.tenant.payment import Payment
    result = await db.execute(
        select(Payment).where(Payment.member_id == member_id).order_by(Payment.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{member_id}/checkins", dependencies=[Depends(ensure_member_visible)])
async def get_member_checkins(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    from app.models.tenant.checkin import CheckIn
    result = await db.execute(
        select(CheckIn).where(CheckIn.member_id == member_id).order_by(CheckIn.created_at.desc()).limit(50)
    )
    return result.scalars().all()


@router.get("/{member_id}/memberships", response_model=list[MembershipResponse],
            dependencies=[Depends(ensure_member_visible)])
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


@router.post("/{member_id}/renewal-link", dependencies=[Depends(require_perm(perm.PAYMENTS_WRITE))])
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
        kind="membership",
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


@router.post("/{member_id}/photo", dependencies=[Depends(require_perm(perm.MEMBERS_WRITE))])
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

    if member.consent_image_at is None:
        raise HTTPException(
            status_code=409,
            detail="El socio no ha autorizado el uso de su imagen. Registra el consentimiento antes de subir la foto.",
        )
    key = f"members/{slug}/{member_id}.{ext}"
    # Se persiste la key: la foto es dato personal y se sirve firmada
    member.photo_url = await upload_image(data, key, file.content_type)
    await db.commit()
    return {"photo_url": resolve_media_url(member.photo_url)}


@router.post("/{member_id}/consent", dependencies=[Depends(require_perm(perm.MEMBERS_WRITE))])
async def record_consent(
    member_id: uuid.UUID,
    payload: ConsentUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user=Depends(get_current_staff),
):
    """Registra (o revoca) el consentimiento de datos/imagen de un socio.
    Revocar la imagen borra la foto del almacenamiento (supresión real)."""
    from app.core.timeutil import utcnow_naive
    from app.services.audit import audit
    member = (await db.execute(select(Member).where(Member.id == member_id))).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    revoking = (payload.consent_data is False) or (payload.consent_image is False)
    if revoking and current_user.role == UserRole.receptionist:
        raise HTTPException(status_code=403, detail="Solo owner o admin revocan consentimientos")
    changes = {}
    if payload.consent_data is not None:
        member.consent_data_at = utcnow_naive() if payload.consent_data else None
        changes["consent_data"] = payload.consent_data
    if payload.consent_image is not None:
        member.consent_image_at = utcnow_naive() if payload.consent_image else None
        changes["consent_image"] = payload.consent_image
        if not payload.consent_image and member.photo_url:
            changes["photo_deleted"] = await delete_object(member.photo_url)
            member.photo_url = None
    audit(db, current_user, "member.consent", "member", member.id, changes)
    await db.commit()
    return {"consent_data_at": member.consent_data_at, "consent_image_at": member.consent_image_at, "photo_url": resolve_media_url(member.photo_url) if member.photo_url else None}


@router.get("/profile-summary")
async def profile_summary(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    solo_mios: uuid.UUID | None = Depends(trainer_scope),
):
    """Cuántas fichas están incompletas y a cuántas se les puede escribir."""
    base = select(func.count()).select_from(Member).where(
        Member.member_type == "member", member_profile.incomplete_condition())
    if solo_mios is not None:
        base = base.where(Member.trainer_id == solo_mios)
    total = (await db.execute(base)).scalar_one()
    with_phone = (await db.execute(base.where(Member.phone.is_not(None)))).scalar_one()
    with_email = (await db.execute(base.where(Member.email.is_not(None)))).scalar_one()
    return {"incomplete": total, "with_phone": with_phone, "with_email": with_email}


@router.get("/{member_id}", response_model=MemberResponse)
async def get_member(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    solo_mios: uuid.UUID | None = Depends(trainer_scope),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    # Para el entrenador, un socio ajeno no existe: 404, no 403. Un 403 confirma
    # que ese id es de alguien del gym.
    if solo_mios is not None and member.trainer_id != solo_mios:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    return member


@router.put("/{member_id}", response_model=MemberResponse, dependencies=[Depends(require_perm(perm.MEMBERS_WRITE))])
async def update_member(
    member_id: uuid.UUID,
    payload: MemberUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    slug: str = Depends(get_tenant_slug),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    if payload.photo_url is not None:
        payload.photo_url = scoped_key(payload.photo_url, f"members/{slug}/") or member.photo_url
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
        if field == "access_by_document" and value is None:
            continue
        setattr(member, field, value)

    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{member_id}", status_code=204, dependencies=[Depends(require_perm(perm.MEMBERS_DELETE))])
async def delete_member(
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    # El historial de dinero no se borra nunca: si el socio ya pagó algo o compró
    # un pase (los pases llevan precio), se desactiva en vez de borrarse. Antes
    # esto reventaba con un 500 por la llave foránea de memberships.
    pagos = await db.scalar(
        select(func.count()).select_from(Payment).where(Payment.member_id == member_id)
    )
    pases = await db.scalar(
        select(func.count()).select_from(DayPass).where(DayPass.member_id == member_id)
    )
    if pagos or pases:
        raise HTTPException(
            status_code=409,
            detail="Este socio tiene movimientos de dinero registrados: desactívalo en vez "
                   "de borrarlo (el historial de caja debe conservarse)",
        )

    # Sin dinero de por medio, lo demás es historial operativo del propio socio.
    for modelo in (Membership, CheckIn, ClassEnrollment, SessionBooking, MemberRoutine):
        await db.execute(delete(modelo).where(modelo.member_id == member_id))

    if member.photo_url:
        await delete_object(member.photo_url)
    await db.delete(member)
    await db.commit()
    return None


# ─── Completar la ficha por enlace (WhatsApp, correo, app) ──────────────────

class ProfileLinkRequest(BaseModel):
    channel: Literal["whatsapp", "email", "copy"]


class BulkProfileLinksRequest(BaseModel):
    channel: Literal["whatsapp", "email"]
    limit: int = 100


async def _send_profile_link(db, member: Member, channel: str, url: str, gym_name: str) -> tuple[bool, str | None]:
    """Encola o envía el enlace. Devuelve (enviado, motivo si no)."""
    text = member_profile.message_text(member, gym_name, url)
    if channel == "whatsapp":
        if not member.phone:
            return False, "El socio no tiene celular registrado"
        from app.services.events import emit_announcement
        await emit_announcement(
            db, idempotency_key=f"profile-link:{uuid.uuid4().hex}", title="Completa tus datos",
            message=text, member_id=member.id, phone=member.phone,
        )
        return True, None
    if channel == "email":
        if not member.email:
            return False, "El socio no tiene correo registrado"
        from app.services import mailer
        await mailer.send(member.email, f"{gym_name}: completa tus datos", text)
        return True, None
    return False, None


@router.get("/{member_id}/profile-status", dependencies=[Depends(ensure_member_visible)])
async def profile_status(member_id: uuid.UUID, db: AsyncSession = Depends(get_tenant_db_from_token)):
    member = await db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    from app.models.tenant.profile_link import ProfileLink
    last = (await db.execute(
        select(ProfileLink).where(ProfileLink.member_id == member_id).order_by(ProfileLink.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    return {
        **member_profile.status(member),
        "last_link": {
            "channel": last.channel, "created_at": last.created_at.isoformat(),
            "opened_at": last.opened_at.isoformat() if last.opened_at else None,
            "used_at": last.used_at.isoformat() if last.used_at else None,
            "expires_at": last.expires_at.isoformat(),
        } if last else None,
    }


@router.post("/{member_id}/profile-link", dependencies=[Depends(require_perm(perm.MEMBERS_WRITE))])
async def send_profile_link(
    member_id: uuid.UUID,
    payload: ProfileLinkRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    tenant: Tenant = Depends(get_tenant_from_claims),
):
    """Enlace personal para que el socio complete su ficha. "copy" solo lo
    devuelve para pegarlo donde recepción quiera."""
    member = await db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    if payload.channel != "copy" and await member_profile.sent_recently(db, member.id):
        raise HTTPException(status_code=429, detail="Ya se le envió un enlace hace menos de 10 minutos.")
    gym = await get_gym_settings(db)
    gym_name = getattr(gym, "legal_name", None) or tenant.name
    link, token = await member_profile.create_link(db, member, channel=payload.channel, created_by=current_user.id)
    url = member_profile.link_url(tenant.slug, token)
    sent, reason = await _send_profile_link(db, member, payload.channel, url, gym_name)
    if payload.channel != "copy" and not sent:
        raise HTTPException(status_code=409, detail=reason)
    audit(db, current_user, "member.profile_link", "member", member.id, {"channel": payload.channel})
    await db.commit()
    return {"url": url, "expires_at": link.expires_at.isoformat(), "sent": sent,
            "message": member_profile.message_text(member, gym_name, url)}


@router.post("/profile-links/bulk", dependencies=[Depends(require_perm(perm.MEMBERS_WRITE))])
async def send_profile_links_bulk(
    payload: BulkProfileLinksRequest,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    tenant: Tenant = Depends(get_tenant_from_claims),
):
    """Envía el enlace a los socios con la ficha incompleta que tengan ese canal.
    A quien ya se le mandó uno en los últimos 3 días no se le vuelve a mandar."""
    limit = max(1, min(payload.limit, member_profile.BULK_MAX))
    gym = await get_gym_settings(db)
    gym_name = getattr(gym, "legal_name", None) or tenant.name
    members = await member_profile.bulk_candidates(db, payload.channel, limit)
    sent = 0
    for member in members:
        _, token = await member_profile.create_link(db, member, channel=payload.channel, created_by=current_user.id)
        ok, _ = await _send_profile_link(db, member, payload.channel, member_profile.link_url(tenant.slug, token), gym_name)
        sent += int(ok)
    remaining = (await db.execute(
        select(func.count()).select_from(Member).where(
            Member.member_type == "member", member_profile.incomplete_condition())
    )).scalar_one()
    audit(db, current_user, "member.profile_links_bulk", "member", None, {"channel": payload.channel, "sent": sent})
    await db.commit()
    return {"sent": sent, "incomplete_total": remaining}
