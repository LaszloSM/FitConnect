"""Serial del equipo → gimnasio, para los equipos que llaman solos a la nube."""
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.db.master_session import MasterSessionLocal
from app.db.tenant_session import get_tenant_engine
from app.models.master.device_directory import DeviceDirectory


class SerialTaken(Exception):
    pass


async def lookup(serial: str) -> Optional[DeviceDirectory]:
    async with MasterSessionLocal() as master:
        return (await master.execute(
            select(DeviceDirectory).where(DeviceDirectory.serial == serial.strip())
        )).scalar_one_or_none()


async def register(serial: str, db_name: str, device_id) -> None:
    """Registra o mueve el serial a este equipo. Un serial de OTRO gimnasio no se
    pisa: dos gyms no pueden reclamar el mismo torniquete."""
    serial = serial.strip()
    async with MasterSessionLocal() as master:
        row = (await master.execute(select(DeviceDirectory).where(DeviceDirectory.serial == serial))).scalar_one_or_none()
        if row and row.db_name != db_name:
            raise SerialTaken(serial)
        if row:
            row.device_id = device_id
        else:
            from app.models.master.tenant import Tenant
            tenant_id = (await master.execute(select(Tenant.id).where(Tenant.db_name == db_name))).scalar_one()
            master.add(DeviceDirectory(serial=serial, tenant_id=tenant_id, db_name=db_name, device_id=device_id))
        await master.commit()


async def unregister_device(db_name: str, device_id) -> None:
    async with MasterSessionLocal() as master:
        await master.execute(delete(DeviceDirectory).where(
            DeviceDirectory.db_name == db_name, DeviceDirectory.device_id == device_id,
        ))
        await master.commit()


@asynccontextmanager
async def tenant_session(db_name: str) -> AsyncIterator[AsyncSession]:
    engine = get_tenant_engine(settings.tenant_database_url_template.replace("{db_name}", db_name))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
