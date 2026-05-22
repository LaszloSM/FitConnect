from datetime import datetime
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy import func


class TenantBase(DeclarativeBase):
    """Base declarativa para las bases de datos independientes de cada gym.
    Contiene: members, payments, checkins, machines, classes, staff, etc.
    """
    pass


class TenantTimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)
