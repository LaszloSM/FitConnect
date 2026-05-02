import uuid
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class InviteUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class UpdateUserRoleRequest(BaseModel):
    role: UserRole
