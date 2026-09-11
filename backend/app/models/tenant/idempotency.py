import uuid
from typing import Optional

from sqlalchemy import String, Integer, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import mapped_column, Mapped

from app.db.tenant_base import TenantBase, TenantTimestampMixin


class IdempotencyKey(TenantBase, TenantTimestampMixin):
    """Clave de idempotencia de una escritura de dinero.

    Dos clics en "Cobrar", un F5 a mitad del cobro o un reintento de red creaban
    dos pagos, dos recibos y —en la renovación— dos membresías encadenadas. El
    cliente genera la clave al ABRIR el formulario y la reenvía en cada intento;
    la unicidad de `key` es lo que hace que solo uno gane.

    `request_hash` distingue "el mismo cobro reintentado" de "otro cobro enviado
    por error con la misma clave": lo segundo es un 409, no una repetición.
    """
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("key", name="uq_idempotency_key"),
        # La purga diaria borra por antigüedad: sin índice haría seq scan.
        Index("ix_idempotency_keys_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(80), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    response: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
