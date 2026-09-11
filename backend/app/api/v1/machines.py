import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.deps import get_tenant_db_from_token, get_current_staff, get_tenant_slug, require_perm
from app.core import permissions as perm
from app.core.timeutil import today_bogota
from app.schemas.operations import (
    MachineCreate, MachineUpdate, MachineResponse,
    MaintenanceLogCreate, MaintenanceLogResponse,
)
from app.models.tenant.machine import Machine, MachineStatus
from app.models.tenant.maintenance import MaintenanceLog
from app.models.tenant.user_staff import UserStaff
from app.services.audit import audit
from app.services.machine_status import maintenance_state
from app.services.storage import resolve_media_url, upload_image

router = APIRouter(prefix="/machines", tags=["machines"], dependencies=[Depends(require_perm(perm.MACHINES_READ))])


def _serialize(machine: Machine, today: date) -> dict:
    """El estado de mantenimiento lo calcula el backend, no cada pantalla."""
    estado = maintenance_state(machine, today)
    data = MachineResponse.model_validate(machine).model_dump()
    data["next_maintenance_date"] = estado.next_date
    data["is_overdue"] = estado.is_overdue
    data["is_due_soon"] = estado.is_due_soon
    data["days_until_maintenance"] = estado.days_until
    return data


class MachineList(BaseModel):
    items: list[dict]
    total: int
    overdue: int


@router.get("", response_model=MachineList)
async def list_machines(
    db: AsyncSession = Depends(get_tenant_db_from_token),
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
        filtros.append(Machine.area == area)
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
    serializadas = [_serialize(m, hoy) for m in todas]
    vencidas = sum(1 for m in serializadas if m["is_overdue"])

    if only_overdue:
        serializadas = [m for m in serializadas if m["is_overdue"]]
        total = len(serializadas)

    return MachineList(
        items=serializadas[offset:offset + limit],
        total=total,
        overdue=vencidas,
    )


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
    return _serialize(machine, today_bogota())


_TIPOS_FOTO = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_MAX_FOTO_BYTES = 5 * 1024 * 1024


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
    ext = _TIPOS_FOTO.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Formato no soportado (usa JPG, PNG o WEBP)")

    machine = (await db.execute(
        select(Machine).where(Machine.id == machine_id)
    )).scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")

    # Por trozos con corte temprano: leer el archivo entero antes de validar el
    # tamaño tumba un servidor de 2 GB con una sola subida grande.
    trozos: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > _MAX_FOTO_BYTES:
            raise HTTPException(status_code=400, detail="La imagen supera 5 MB")
        trozos.append(chunk)

    machine.photo_url = await upload_image(
        b"".join(trozos), f"machines/{slug}/{machine_id}.{ext}", file.content_type
    )
    await db.commit()
    return {"photo_url": resolve_media_url(machine.photo_url)}


@router.get("/{machine_id}")
async def get_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    machine = (await db.execute(
        select(Machine).where(Machine.id == machine_id)
    )).scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    return _serialize(machine, today_bogota())


@router.put("/{machine_id}", dependencies=[Depends(require_perm(perm.MACHINES_WRITE))])
async def update_machine(
    machine_id: uuid.UUID,
    payload: MachineUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    machine = (await db.execute(
        select(Machine).where(Machine.id == machine_id)
    )).scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
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
    return _serialize(machine, today_bogota())


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
    machine = (await db.execute(
        select(Machine).where(Machine.id == machine_id)
    )).scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")

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
    machine = (await db.execute(select(Machine).where(Machine.id == machine_id))).scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
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
    machine = (await db.execute(select(Machine).where(Machine.id == machine_id))).scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
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
