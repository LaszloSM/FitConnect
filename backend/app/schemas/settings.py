from pydantic import BaseModel, EmailStr
from typing import Optional


class UserProfileResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class GymSettingsResponse(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    logo_url: Optional[str] = None
    plan: Optional[str] = None


class GymSettingsUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    logo_url: Optional[str] = None


class NotificationPreferences(BaseModel):
    expiring_memberships: bool = True
    payment_alerts: bool = True
    new_members: bool = True
    low_attendance: bool = False
