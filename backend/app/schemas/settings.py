from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: str
    role: str


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=8)


class GymSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    logo_url: Optional[str] = None
    plan: Optional[str] = None
    operating_hours: Optional[dict] = None


class GymSettingsUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    logo_url: Optional[str] = None
    operating_hours: Optional[dict] = None


class NotificationPreferences(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    expiring_memberships: bool = True
    payment_alerts: bool = True
    new_members: bool = True
    low_attendance: bool = False


class NotificationPreferencesUpdate(BaseModel):
    expiring_memberships: Optional[bool] = None
    payment_alerts: Optional[bool] = None
    new_members: Optional[bool] = None
    low_attendance: Optional[bool] = None
