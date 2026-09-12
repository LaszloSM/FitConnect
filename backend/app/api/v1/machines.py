import secrets
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_slug, require_perm
from app.core import permissions as perm
from app.core.permissions import has_perm
from app.core.timeutil import today_bogota, utcnow_naive
from app.schemas.operations import (
    MachineCreate, MachineUpdate, MachineResponse,
    MaintenanceLogCreate, MaintenanceLogResponse,
)
from app.models.tenant.machine import Machine, MachineStatus
from app.models.tenant.maintenance import MaintenanceLog
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.machine_areas import AREA_LABELS, normalize_area
from app.services.machine_status import maintenance_state
from app.services.storage import resolve_media_url, upload_image

router = APIRouter(prefix="/machines", tags=["machines"], dependencies=[Depends(require_perm(perm.MACHINES_READ))])


def _serialize(machine: Machine, today: date, cost_total=None) -> dict:
    """El estado de mantenimiento lo calcula el backend, no cada pantalla."""
    estado = maintenance_state(machine, today)
    data = MachineResponse.model_validate(machine).model_dump()
    data["next_maintenance_date"] = estado.next_date
    data["is_overdue"] = estado.is_overdue
    data["is_due_soon"] = estado.is_due_soon
    data["days_until_maintenance"] = estado.days_until
    data["warranty_active"] = bool(machine.warranty_until and machine.warranty_until >= today)
    data["has_report_link"] = bool(machine.report_token)
    # El costo acumulado es plata del negocio: solo lo recibe quien administra equipos.
    if cost_total is not None:
        data["maintenance_cost_total"] = str(cost_total)
    return data


async def _costs_by_machine(db: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, object]:
    if not ids:
        return {}
    rows = (await db.execute(
        select(MaintenanceLog.machine_id, func.coalesce(func.sum(MaintenanceLog.cost), 0))
        .where(MaintenanceLog.machine_id.in_(ids))
        .group_by(MaintenanceLog.machine_id)
    )).all()
    return {mid: total for mid, total in rows}


class MachineList(BaseModel):
    items: list[dict]
    total: int
    overdue: int


_TIPOS_FOTO = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_MAX_FOTO_BYTES = 5 * 1024 * 1024


async def _read_image(file: UploadFile) -> tuple[bytes, str]:
    ext = _TIPOS_FOTO.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Formato no soportado (usa JPG, PNG o WEBP)")
    # Por trozos con corte temprano: leer el archivo entero antes de validar el
    # tamaño tumba un servidor de 2 GB con una sola subida grande.
    trozos: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > _MAX_FOTO_BYTES:
            raise HTTPException(status_code=400, detail="La imagen supera 5 MB")
        trozos.append(chunk)
    return b"".join(trozos), ext


async def _get_machine(db: AsyncSession, machine_id: uuid.UUID) -> Machine:
    machine = (await db.execute(select(Machine).where(Machine.id == machine_id))).scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    return machine


@router.get("", response_model=MachineList)
async def list_machines(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    q: str = Query("", description="Nombre, marca o serial"),
    status: Optional[str] = Query(None),
    area: Optional[str] = Query(None),
    location_id: Optional[uuid.UUID] = Query(None),
    only_overdue: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Antes devolvía una lista pelada y la pantalla se quedaba con las 50
    primeras sin decirlo. Ahora viaja el total, para que la paginación exista."""
    filtros = []
    if q:
        patron = f"%{q.strip()}%"
        filtros.append(or_(
            Machine.name.ilike(patron),
            Machine.brand.ilike(patron),
            Machine.serial_number.ilike(patron),
        ))
    if status:
        filtros.append(Machine.status == status)
    if area:
        try:
            filtros.append(Machine.area == normalize_area(area))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if location_id:
        filtros.append(Machine.location_id == location_id)

    base = select(Machine)
    for f in filtros:
        base = base.where(f)

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar_one()

    hoy = today_bogota()

    # "Vencida" no es una columna: se deriva de last_maintenance_date + intervalo.
    # Filtrar y contar en Python sobre el conjunto ya filtrado es honesto mientras
    # un gym tenga cientos de máquinas, no millones.
    todas = (await db.execute(base.order_by(Machine.name))).scalars().all()
    costos = (
        await _costs_by_machine(db, [m.id for m in todas])
        if has_perm(current_user.role, perm.MACHINES_WRITE) else None
    )
    serializadas = [
        _serialize(m, hoy, (costos.get(m.id, 0) if costos is not None else None))
        for m in todas
    ]
    vencidas = sum(1 for m in serializadas if m["is_overdue"])

    if only_overdue:
        serializadas = [m for m in serializadas if m["is_overdue"]]
        total = len(serializadas)

    return MachineList(
        items=serializadas[offset:offset + limit],
        total=total,
        overdue=vencidas,
    )


@router.get("/areas")
async def list_areas():
    return [{"value": slug, "label": label} for slug, label in AREA_LABELS.items()]


@router.get("/calendar")
async def maintenance_calendar(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    days: int = Query(60, ge=7, le=366),
):
    """Qué preventivo toca y cuándo, en vez de solo un badge rojo en la lista.

    Incluye lo vencido: es lo primero que hay que ver al planear la semana.
    """
    hoy = today_bogota()
    limite = hoy + timedelta(days=days)
    maquinas = (await db.execute(
        select(Machine).where(
            Machine.status != MachineStatus.retired,
            Machine.maintenance_interval_days.is_not(None),
        )
    )).scalars().all()
    items = []
    for m in maquinas:
        estado = maintenance_state(m, hoy)
        if estado.next_date is None or estado.next_date > limite:
            continue
        items.append({
            "id": str(m.id),
            "name": m.name,
            "area": m.area,
            "location_id": str(m.location_id) if m.location_id else None,
            "status": m.status.value,
            "next_maintenance_date": estado.next_date.isoformat(),
            "days_until_maintenance": estado.days_until,
            "is_overdue": estado.is_overdue,
        })
    items.sort(key=lambda i: (i["next_maintenance_date"], i["name"]))
    return {"from": hoy.isoformat(), "to": limite.isoformat(), "items": items}


@router.get("/costs", dependencies=[Depends(require_perm(perm.MACHINES_WRITE))])
async def maintenance_costs(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    days: int = Query(365, ge=7, le=3650),
):
    """`MaintenanceLog.cost` se guardaba y no se mostraba en ninguna parte.

    Por área y por máquina, separando preventivo de correctivo: una máquina que
    se come el presupuesto en arreglos es una máquina que conviene reemplazar.
    """
    desde = utcnow_naive() - timedelta(days=days)
    correctivo = case((MaintenanceLog.kind == "correctivo", MaintenanceLog.cost), else_=0)
    filas = (await db.execute(
        select(
            Machine.id, Machine.name, Machine.area,
            func.coalesce(func.sum(MaintenanceLog.cost), 0),
            func.coalesce(func.sum(correctivo), 0),
            func.count(MaintenanceLog.id),
        )
        .join(Machine, Machine.id == MaintenanceLog.machine_id)
        .where(MaintenanceLog.created_at >= desde)
        .group_by(Machine.id, Machine.name, Machine.area)
    )).all()

    total = sum((f[3] for f in filas), 0)
    total_correctivo = sum((f[4] for f in filas), 0)
    por_area: dict[str, dict] = {}
    for mid, name, area, monto, _, n in filas:
        clave = area or "sin_area"
        g = por_area.setdefault(clave, {
            "area": area, "label": AREA_LABELS.get(area or "", area or "Sin área"), "amount": 0, "count": 0,
        })
        g["amount"] += monto
        g["count"] += n

    por_maquina = sorted(filas, key=lambda f: f[3], reverse=True)[:10]
    return {
        "days": days,
        "total": str(total),
        "corrective": str(total_correctivo),
        "preventive": str(total - total_correctivo),
        "by_area": sorted(
            ({**g, "amount": str(g["amount"])} for g in por_area.values()),
            key=lambda g: float(g["amount"]), reverse=True,
        ),
        "by_machine": [
            {
                "id": str(mid), "name": name, "area": area,
                "amount": str(monto), "corrective": str(corr), "count": n,
            }
            for mid, name, area, monto, corr, n in por_maquina
        ],
    }


@router.post("", status_code=201, dependencies=[Depends(require_perm(perm.MACHINES_WRITE))])
async def create_machine(
    payload: MachineCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    machine = Machine(**payload.model_dump())
    db.add(machine)
    await db.flush()
    audit(db, current_user, "machine.create", "machine", machine.id,
          {"name": machine.name, "area": machine.area})
    await db.commit()
    await db.refresh(machine)
    return _serialize(machine, today_bogota(), 0)


@router.post("/{machine_id}/photo", dependencies=[Depends(require_perm(perm.MACHINES_WRITE))])
async def upload_machine_photo(
    machine_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
    slug: str = Depends(get_tenant_slug),
):
    """Foto de la máquina: antes solo se podía pegar una URL a mano.

    Se persiste la KEY, nunca la URL firmada (vence en 15 minutos), igual que la
    foto del socio y el comprobante de pago.
    """
    contenido, ext = await _read_image(file)
    machine = await _get_machine(db, machine_id)
    machine.photo_url = await upload_image(
        contenido, f"machines/{slug}/{machine_id}.{ext}", file.content_type
    )
    await db.commit()
    return {"photo_url": resolve_media_url(machine.photo_url)}


@router.post("/{machine_id}/report-link", dependencies=[Depends(require_perm(perm.MACHINES_WRITE))])
async def machine_report_link(
    machine_id: uuid.UUID,
    rotate: bool = Query(False),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
    slug: str = Depends(get_tenant_slug),
):
    """Enlace del QR que se pega en la máquina.

    Cualquiera que la encuentre rota la reporta desde el celular, sin cuenta.
    `rotate` invalida el QR anterior (una calcomanía despegada que alguien usa
    para molestar).
    """
    machine = await _get_machine(db, machine_id)
    if machine.report_token is None or rotate:
        machine.report_token = secrets.token_urlsafe(18)
        audit(db, current_user, "machine.report_link", "machine", machine.id,
              {"name": machine.name, "rotated": rotate})
        await db.commit()
    return {"token": machine.report_token, "path": f"/reportar/{slug}/{machine.report_token}"}


@router.get("/{machine_id}")
async def get_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    return _serialize(await _get_machine(db, machine_id), today_bogota())


@router.put("/{machine_id}", dependencies=[Depends(require_perm(perm.MACHINES_WRITE))])
async def update_machine(
    machine_id: uuid.UUID,
    payload: MachineUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    machine = await _get_machine(db, machine_id)
    cambios = payload.model_dump(exclude_unset=True)
    # El front devuelve lo que recibió (URL firmada); la key guardada manda.
    if isinstance(cambios.get("photo_url"), str) and cambios["photo_url"].startswith("http"):
        cambios.pop("photo_url")
    antes = {f: str(getattr(machine, f)) for f in cambios if hasattr(machine, f)}
    for field, value in cambios.items():
        setattr(machine, field, value)
    audit(db, current_user, "machine.update", "machine", machine.id,
          {"before": antes, "after": {f: str(v) for f, v in cambios.items()}})
    await db.commit()
    await db.refresh(machine)
    costos = await _costs_by_machine(db, [machine.id])
    return _serialize(machine, today_bogota(), costos.get(machine.id, 0))


@router.delete("/{machine_id}", dependencies=[Depends(require_perm(perm.MACHINES_WRITE))])
async def delete_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    """Con historial se retira; sin historial se borra.

    Antes era un DELETE físico contra una FK sin cascada: borrar una máquina con
    mantenimientos registrados devolvía 500. Y borrar de verdad una máquina con
    historial tampoco es lo que el gym quiere: ese historial es el argumento para
    reclamar la garantía.
    """
    machine = await _get_machine(db, machine_id)

    historial = (await db.execute(
        select(func.count()).select_from(MaintenanceLog)
        .where(MaintenanceLog.machine_id == machine_id)
    )).scalar_one()

    if historial:
        machine.status = MachineStatus.retired
        audit(db, current_user, "machine.retire", "machine", machine.id,
              {"name": machine.name, "maintenance_logs": historial})
        await db.commit()
        return {"archived": True, "detail": "La máquina se retiró: conserva su historial"}

    audit(db, current_user, "machine.delete", "machine", machine.id, {"name": machine.name})
    await db.delete(machine)
    await db.commit()
    return {"archived": False}


# ─── Historial de mantenimiento ───

@router.get("/{machine_id}/maintenance", response_model=list[MaintenanceLogResponse])
async def list_maintenance(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(
        select(MaintenanceLog)
        .where(MaintenanceLog.machine_id == machine_id)
        .order_by(desc(MaintenanceLog.created_at))
    )
    return result.scalars().all()


@router.post("/{machine_id}/maintenance", response_model=MaintenanceLogResponse, status_code=201,
             dependencies=[Depends(require_perm(perm.MACHINES_MAINTAIN))])
async def create_maintenance(
    machine_id: uuid.UUID,
    payload: MaintenanceLogCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    machine = await _get_machine(db, machine_id)
    datos = payload.model_dump()
    datos.setdefault("reported_by", None)
    if not datos.get("reported_by"):
        datos["reported_by"] = current_user.full_name
    log = MaintenanceLog(machine_id=machine_id, **datos)
    db.add(log)
    # Solo el preventivo reinicia el ciclo: engrasar una banda rota no significa
    # que el mantenimiento programado del mes ya se hizo.
    if log.kind == "preventivo":
        machine.last_maintenance_date = today_bogota()
        if machine.status == MachineStatus.maintenance:
            machine.status = MachineStatus.active
    await db.commit()
    await db.refresh(log)
    return log


@router.post("/{machine_id}/maintenance/{log_id}/photo",
             dependencies=[Depends(require_perm(perm.MACHINES_MAINTAIN))])
async def upload_maintenance_photo(
    machine_id: uuid.UUID,
    log_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db_from_token),
    _: UserStaff = Depends(get_current_staff),
    slug: str = Depends(get_tenant_slug),
):
    """La foto de la avería vale más que la descripción cuando llega el técnico."""
    contenido, ext = await _read_image(file)
    log = (await db.execute(
        select(MaintenanceLog).where(MaintenanceLog.id == log_id, MaintenanceLog.machine_id == machine_id)
    )).scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Registro de mantenimiento no encontrado")
    log.photo_url = await upload_image(
        contenido, f"maintenance/{slug}/{log_id}.{ext}", file.content_type
    )
    await db.commit()
    return {"photo_url": resolve_media_url(log.photo_url)}


class FaultReport(BaseModel):
    """Reporte de avería desde la pantalla del gym o el mostrador."""
    description: str = Field(min_length=3, max_length=1000)
    reported_by: str | None = Field(default=None, max_length=255)


@router.post("/{machine_id}/report-fault", response_model=MaintenanceLogResponse, status_code=201,
             dependencies=[Depends(require_perm(perm.MACHINES_MAINTAIN))])
async def report_fault(
    machine_id: uuid.UUID,
    payload: FaultReport,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    """Una avería reportada marca la máquina como dañada en el acto.

    El socio que la encontró rota deja de ser el único que lo sabe: la máquina
    sale de circulación en la pantalla y queda el registro de quién avisó.
    """
    machine = await _get_machine(db, machine_id)
    log = MaintenanceLog(
        machine_id=machine_id,
        description=payload.description,
        technician="Pendiente de asignar",
        kind="correctivo",
        reported_by=payload.reported_by or current_user.full_name,
    )
    db.add(log)
    machine.status = MachineStatus.damaged
    audit(db, current_user, "machine.fault_reported", "machine", machine.id,
          {"name": machine.name, "description": payload.description[:200]})
    await db.commit()
    await db.refresh(log)
    return log
