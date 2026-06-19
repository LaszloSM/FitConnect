import uuid
from sqlalchemy import String, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class Location(TenantBase, TenantTimestampMixin):
    """Sedes o ubicaciones del gym."""
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    max_capacity: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
