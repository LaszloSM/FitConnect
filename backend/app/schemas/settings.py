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
    country: Optional[str] = None
    logo_url: Optional[str] = None
    plan: Optional[str] = None
    operating_hours: Optional[dict] = None


class GymSettingsUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = Field(default=None, min_length=2, max_length=2)
    logo_url: Optional[str] = None
    operating_hours: Optional[dict] = None


