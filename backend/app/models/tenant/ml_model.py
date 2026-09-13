import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, LargeBinary, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class MlModel(TenantBase, TenantTimestampMixin):
    """Un modelo entrenado con los datos de ESTE gimnasio.

    El entrenamiento corre en el job nocturno; el request solo infiere o lee el
    resultado. `status` dice si hay modelo o por qué no: con poco historial la
    pantalla cae a las reglas y lo explica.
    """
    __tablename__ = "ml_models"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    # trained | weak | insufficient_data | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    detail: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    n_samples: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metrics: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    result: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Estimador serializado (solo el de abandono lo necesita para inferir).
    payload: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    sklearn_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
