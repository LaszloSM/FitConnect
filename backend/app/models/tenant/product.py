import uuid
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, Boolean, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from app.db.tenant_base import TenantBase, TenantTimestampMixin


class Product(TenantBase, TenantTimestampMixin):
    """Catálogo de productos de mostrador (agua, proteína, accesorios)."""
    __tablename__ = "products"
    __table_args__ = (
        Index("uq_products_sku", "sku", unique=True, postgresql_where=text("sku IS NOT NULL")),
        Index("uq_products_barcode", "barcode", unique=True, postgresql_where=text("barcode IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("product_categories.id"), nullable=True)
    # Costo de compra: margen = precio − costo (snapshot en cada venta)
    cost_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    sku: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    barcode: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
