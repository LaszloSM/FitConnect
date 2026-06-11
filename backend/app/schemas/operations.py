import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

from app.models.tenant.gym_class import ClassCategory, ClassDifficulty


# ─── Location ───
class LocationBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address: str = Field(min_length=1, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=50)
    max_capacity: int = Field(default=100, ge=1)
    is_active: bool = True


class LocationCreate(LocationBase):
    pass


class LocationResponse(LocationBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── GymClass ───
class GymClassBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    instructor: str = Field(min_length=1, max_length=255)
    schedule: Optional[str] = Field(default=None, max_length=255)  # legado — usar weekdays+start_time
    weekdays: Optional[list[int]] = None  # [0=Lun..6=Dom]
    start_time: Optional[time] = None
    category: Optional[ClassCategory] = None
    difficulty: Optional[ClassDifficulty] = None
    color: Optional[str] = Field(default=None, max_length=7)  # hex: "#F97316"
    max_capacity: int = Field(ge=1)
    duration_minutes: int = Field(ge=1)
    location_id: Optional[uuid.UUID] = None
    is_active: bool = True
    description: Optional[str] = Field(default=None, max_length=1000)


class GymClassCreate(GymClassBase):
    pass


class GymClassUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    instructor: Optional[str] = Field(default=None, min_length=1, max_length=255)
    schedule: Optional[str] = Field(default=None, max_length=255)
    weekdays: Optional[list[int]] = None
    start_time: Optional[time] = None
    category: Optional[ClassCategory] = None
    difficulty: Optional[ClassDifficulty] = None
    color: Optional[str] = Field(default=None, max_length=7)
    max_capacity: Optional[int] = Field(default=None, ge=1)
    duration_minutes: Optional[int] = Field(default=None, ge=1)
    location_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=1000)


class GymClassResponse(GymClassBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── ClassEnrollment ───
class ClassEnrollmentCreate(BaseModel):
    gym_class_id: uuid.UUID
    member_id: uuid.UUID


class EnrollRequest(BaseModel):
    member_id: uuid.UUID


class ClassEnrollmentResponse(BaseModel):
    id: uuid.UUID
    gym_class_id: uuid.UUID
    member_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClassEnrollmentDetailResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    member_name: str
    member_email: str

    class Config:
        from_attributes = True


# ─── Machine ───
class MachineBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    area: Optional[str] = Field(default=None, max_length=50)
    brand: Optional[str] = Field(default=None, max_length=100)
    serial_number: Optional[str] = Field(default=None, max_length=100)
    location_id: Optional[uuid.UUID] = None
    status: str = "active"
    last_maintenance_date: Optional[date] = None
    maintenance_interval_days: Optional[int] = Field(default=None, ge=1)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=1000)


class MachineCreate(MachineBase):
    pass


class MachineUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    area: Optional[str] = Field(default=None, max_length=50)
    brand: Optional[str] = Field(default=None, max_length=100)
    serial_number: Optional[str] = Field(default=None, max_length=100)
    location_id: Optional[uuid.UUID] = None
    status: Optional[str] = None
    last_maintenance_date: Optional[date] = None
    maintenance_interval_days: Optional[int] = Field(default=None, ge=1)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=1000)


class MachineResponse(MachineBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── MaintenanceLog ───
class MaintenanceLogBase(BaseModel):
    machine_id: uuid.UUID
    description: str = Field(min_length=1, max_length=1000)
    technician: str = Field(min_length=1, max_length=255)
    cost: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2)
    resolved_at: Optional[date] = None


class MaintenanceLogCreate(MaintenanceLogBase):
    pass


class MaintenanceLogResponse(MaintenanceLogBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Notification ───
class NotificationBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1, max_length=1000)
    type: str = Field(min_length=1, max_length=100)
    member_id: Optional[uuid.UUID] = None


class NotificationCreate(NotificationBase):
    pass


class NotificationResponse(NotificationBase):
    id: uuid.UUID
    is_read: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
