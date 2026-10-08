import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class ImportBatch(TenantBase, TenantTimestampMixin):
    """Una importación masiva aplicada (hoy: socios desde el software anterior).

    `changes` guarda lo necesario para deshacerla: qué socios nacieron en el lote
    y, de los que ya existían, qué campos llenó y con qué valor anterior. Así un
    lote equivocado se revierte entero sin tocar lo que el gym registró después.
    """
    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="members")
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="applied")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    counts: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    changes: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    undone_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    undone_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
