import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.models.tenant.user_staff import UserRole


class InviteUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class InviteResponse(BaseModel):
    """Resultado de invitar staff: el owner comparte `invite_url` con el invitado.
    El usuario no se crea hasta que el invitado acepta y fija su contraseña."""
    email: EmailStr
    full_name: str
    role: UserRole
    invite_url: str
    expires_at: datetime


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class UpdateUserRoleRequest(BaseModel):
    role: UserRole
