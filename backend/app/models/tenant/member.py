import uuid
import enum
from datetime import date
from sqlalchemy import String, ForeignKey, Enum as SAEnum, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MemberStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class Member(TenantBase, TenantTimestampMixin):
    """Miembros del gym."""
    __tablename__ = "members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    id_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[MemberStatus] = mapped_column(SAEnum(MemberStatus), default=MemberStatus.active, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
