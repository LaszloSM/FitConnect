import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional

from app.api.deps import get_tenant_db_from_token
from app.schemas.operations import (
    MachineCreate, MachineUpdate, MachineResponse,
    MaintenanceLogCreate, MaintenanceLogResponse,
)
from app.models.tenant.machine import Machine, MachineStatus
from app.models.tenant.maintenance import MaintenanceLog

router = APIRouter(prefix="/machines", tags=["machines"])


@router.get("", response_model=list[MachineResponse])
async def list_machines(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(Machine)
    if status:
        stmt = stmt.where(Machine.status == status)
    stmt = stmt.order_by(Machine.name).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=MachineResponse, status_code=201)
async def create_machine(
    payload: MachineCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    machine = Machine(**payload.model_dump())
    db.add(machine)
    await db.commit()
    await db.refresh(machine)
    return machine


@router.get("/{machine_id}", response_model=MachineResponse)
async def get_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Maquina no encontrada")
    return machine


@router.put("/{machine_id}", response_model=MachineResponse)
async def update_machine(
    machine_id: uuid.UUID,
    payload: MachineUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Maquina no encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(machine, field, value)
    await db.commit()
    await db.refresh(machine)
    return machine


@router.delete("/{machine_id}", status_code=204)
async def delete_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Maquina no encontrada")
    await db.delete(machine)
    await db.commit()
    return None


# ─── Maintenance Logs ───
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


@router.post("/{machine_id}/maintenance", response_model=MaintenanceLogResponse, status_code=201)
async def create_maintenance(
    machine_id: uuid.UUID,
    payload: MaintenanceLogCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Maquina no encontrada")
    log = MaintenanceLog(machine_id=machine_id, **payload.model_dump(exclude={"machine_id"}))
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log
