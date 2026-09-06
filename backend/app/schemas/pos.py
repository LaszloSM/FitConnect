import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, model_validator


# ─── Productos ───
class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    price: Decimal = Field(gt=0, decimal_places=2)
    stock: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=3, ge=0)
    is_active: bool = True
    category_id: Optional[uuid.UUID] = None
    cost_price: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2)
    sku: Optional[str] = Field(default=None, max_length=50)
    barcode: Optional[str] = Field(default=None, max_length=64)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    price: Optional[Decimal] = Field(default=None, gt=0, decimal_places=2)
    stock: Optional[int] = Field(default=None, ge=0)
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    category_id: Optional[uuid.UUID] = None
    cost_price: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2)
    sku: Optional[str] = Field(default=None, max_length=50)
    barcode: Optional[str] = Field(default=None, max_length=64)


class ProductResponse(ProductBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    category_name: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Categorías e inventario ───
class ProductCategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True


class ProductCategoryOut(ProductCategoryIn):
    id: uuid.UUID

    class Config:
        from_attributes = True


class StockMovementIn(BaseModel):
    """purchase/waste: cantidad positiva (el signo lo pone el tipo);
    adjustment: con signo (+ entra, − sale)."""
    type: str = Field(pattern="^(purchase|adjustment|waste)$")
    quantity: int = Field(ne=0, ge=-99999, le=99999)
    unit_cost: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2)
    note: Optional[str] = Field(default=None, max_length=255)


class StockMovementOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    type: str
    quantity: int
    unit_cost: Optional[Decimal] = None
    stock_after: int
    note: Optional[str] = None
    payment_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    created_by_name: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Items de pago ───
class PaymentItemIn(BaseModel):
    """Renglón de venta: con product_id el servidor toma nombre/precio del
    catálogo y descuenta stock; sin product_id es un cargo libre."""
    product_id: Optional[uuid.UUID] = None
    description: Optional[str] = Field(default=None, max_length=255)
    unit_price: Optional[Decimal] = Field(default=None, gt=0, decimal_places=2)
    quantity: int = Field(default=1, ge=1, le=999)

    @model_validator(mode="after")
    def require_description_for_custom(self):
        if self.product_id is None and (not self.description or self.unit_price is None):
            raise ValueError("Un item sin producto requiere description y unit_price")
        return self


class PaymentItemOut(BaseModel):
    id: uuid.UUID
    product_id: Optional[uuid.UUID] = None
    description: str
    quantity: int
    unit_price: Decimal
    subtotal: Decimal

    class Config:
        from_attributes = True


# ─── Resumen de cobro de un miembro ───
class BillingMembership(BaseModel):
    id: uuid.UUID
    plan_name: str
    end_date: date
    effective_status: str
    days_overdue: int = 0
    balance_due: Decimal = Decimal(0)


class BillingRenewal(BaseModel):
    plan_id: Optional[uuid.UUID] = None
    plan_name: str
    price: Decimal
    duration_days: int


class BillingSummary(BaseModel):
    member_id: uuid.UUID
    member_name: str
    phone: Optional[str] = None
    membership: Optional[BillingMembership] = None
    renewal: Optional[BillingRenewal] = None


# ─── Cuentas por cobrar ───
class ReceivableOut(BaseModel):
    member_id: uuid.UUID
    member_name: str
    phone: Optional[str] = None
    plan_id: Optional[uuid.UUID] = None  # None si el plan fue archivado/borrado
    plan_name: str
    end_date: date
    effective_status: str
    days_overdue: int
    amount_due: Decimal
    kind: str  # "renewal" (vencida/en gracia) | "balance" (abono parcial pendiente)
