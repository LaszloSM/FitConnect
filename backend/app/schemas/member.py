import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

from app.models.tenant.member import MemberStatus
from app.models.tenant.payment import PaymentMethod, PaymentStatus
from app.models.tenant.checkin import CheckInType
from app.models.tenant.membership import MembershipStatus


# ─── Member ───
class MemberBase(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=50)
    id_number: Optional[str] = Field(default=None, max_length=50)
    birth_date: Optional[date] = None
    status: MemberStatus = MemberStatus.active
    notes: Optional[str] = Field(default=None, max_length=1000)


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=50)
    id_number: Optional[str] = Field(default=None, max_length=50)
    birth_date: Optional[date] = None
    status: Optional[MemberStatus] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


class MemberResponse(MemberBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Membership ───
class MembershipBase(BaseModel):
    member_id: uuid.UUID
    plan_name: str = Field(min_length=1, max_length=100)
    price: Decimal = Field(gt=0, decimal_places=2)
    start_date: date
    end_date: date
    duration_days: int = Field(gt=0)
    status: MembershipStatus = MembershipStatus.active
    notes: Optional[str] = Field(default=None, max_length=500)


class MembershipCreate(MembershipBase):
    pass


class MembershipResponse(MembershipBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Payment ───
class PaymentBase(BaseModel):
    member_id: uuid.UUID
    membership_id: Optional[uuid.UUID] = None
    amount: Decimal = Field(gt=0, decimal_places=2)
    method: Optional[PaymentMethod] = None
    status: PaymentStatus = PaymentStatus.pending
    concept: str = Field(min_length=1, max_length=500)
    external_ref: Optional[str] = Field(default=None, max_length=255)


class PaymentCreate(PaymentBase):
    pass


class PaymentUpdate(BaseModel):
    amount: Optional[Decimal] = Field(default=None, gt=0, decimal_places=2)
    method: Optional[PaymentMethod] = None
    status: Optional[PaymentStatus] = None
    concept: Optional[str] = Field(default=None, min_length=1, max_length=500)
    external_ref: Optional[str] = Field(default=None, max_length=255)


class PaymentResponse(PaymentBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── CheckIn ───
class CheckInBase(BaseModel):
    member_id: uuid.UUID
    location_id: Optional[uuid.UUID] = None
    type: CheckInType
    notes: Optional[str] = Field(default=None, max_length=255)


class CheckInCreate(CheckInBase):
    pass


class CheckInResponse(CheckInBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Dashboard ───
class DashboardKPIs(BaseModel):
    total_members: int
    active_members: int
    inactive_members: int
    new_members_this_month: int
    total_payments_month: Decimal
    pending_payments_month: Decimal
    checkins_today: int
    expiring_memberships_7d: int


class MemberGrowthPoint(BaseModel):
    month: str
    count: int


class RevenuePoint(BaseModel):
    month: str
    amount: Decimal


class DashboardOverview(BaseModel):
    kpis: DashboardKPIs
    member_growth: list[MemberGrowthPoint]
    revenue_history: list[RevenuePoint]
