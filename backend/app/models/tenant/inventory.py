import uuid
import enum
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, Boolean, ForeignKey, Index, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class ProductCategory(TenantBase, TenantTimestampMixin):
    __tablename__ = "product_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)


class StockMovementType(str, enum.Enum):
    purchase = "purchase"      # entrada por compra (+)
    sale = "sale"              # venta POS (−)
    adjustment = "adjustment"  # conteo / corrección (±)
    waste = "waste"            # merma, vencido, dañado (−)
    return_ = "return"         # devolución de una venta (+)


class StockMovement(TenantBase):
    """Historial inmutable de inventario: cada cambio de stock deja un renglón
    con quién, cuándo, cuánto y el stock resultante."""
    __tablename__ = "stock_movements"
    __table_args__ = (
        Index("ix_stock_movements_product_created", "product_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Con signo: positivo entra, negativo sale
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    # Costo unitario del movimiento (compra: lo pagado; venta: snapshot del costo para el margen)
    unit_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    stock_after: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True, index=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
