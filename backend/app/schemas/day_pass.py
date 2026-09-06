import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

from app.models.tenant.payment import PaymentMethod


class DayPassTypeBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: Decimal = Field(gt=0, decimal_places=2)
    includes_trainer: bool = False
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0)


class DayPassTypeCreate(DayPassTypeBase):
    pass


class DayPassTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    price: Optional[Decimal] = Field(default=None, gt=0, decimal_places=2)
    includes_trainer: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(default=None, ge=0)


class DayPassTypeResponse(DayPassTypeBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DayPassSell(BaseModel):
    id_number: str = Field(min_length=3, max_length=50)
    full_name: str = Field(min_length=2, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    pass_type_id: uuid.UUID
    method: PaymentMethod
    transfer_account_id: Optional[str] = Field(default=None, max_length=36)
    card_approval_code: Optional[str] = Field(default=None, max_length=50)
    card_terminal: Optional[str] = Field(default=None, max_length=100)


class DayPassResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    pass_type_id: Optional[uuid.UUID] = None
    pass_name: str
    includes_trainer: bool
    valid_on: date
    price: Decimal
    payment_id: Optional[uuid.UUID] = None
    status: str
    created_at: datetime
    # Inyectados
    member_name: Optional[str] = None
    member_id_number: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None

    class Config:
        from_attributes = True


class DayPassSellResponse(BaseModel):
    day_pass: DayPassResponse
    payment_id: uuid.UUID
    payment_status: str
    member_id: uuid.UUID
    is_new_visitor: bool
    receipt_number: Optional[str] = None
    transfer_reference: Optional[str] = None
    destination_account: Optional[dict] = None
    checkout_url: Optional[str] = None
