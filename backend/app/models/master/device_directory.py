import uuid
from sqlalchemy import String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from app.db.master_base import MasterBase, MasterTimestampMixin


class DeviceDirectory(MasterBase, MasterTimestampMixin):
    """Índice global serial → gimnasio para los equipos que llaman solos a la nube.

    Un torniquete ZKTeco por ADMS solo se identifica con su número de serie
    (`/iclock/cdata?SN=...`): sin este índice no hay forma de saber a qué tenant
    pertenece la marcación. Mismo patrón que `staff_directory`.
    """
    __tablename__ = "device_directory"
    __table_args__ = (UniqueConstraint("serial", name="uq_device_directory_serial"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    serial: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    db_name: Mapped[str] = mapped_column(String(255), nullable=False)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
