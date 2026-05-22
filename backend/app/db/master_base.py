from datetime import datetime
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy import func


class MasterBase(DeclarativeBase):
    """Base declarativa para la base de datos maestra (saas_gym_master).
    Contiene: tenants, owners, subscriptions, billing.
    """
    pass


class MasterTimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)
