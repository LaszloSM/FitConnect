from typing import Literal
import re

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    gym_name: str
    city: str
    country: str = Field(default="CO", min_length=2, max_length=2)
    phone: str | None = Field(default=None, max_length=50)

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_colombian_phone(cls, v: str | None) -> str | None:
        if not v or not v.strip():
            return None
        v = v.strip()
        digits = re.sub(r"\D", "", v)
        if not digits:
            return None
        if digits.startswith("57") and len(digits) == 12:
            digits = digits[2:]
        if len(digits) == 10 and digits.startswith("3"):
            return f"+57{digits}"
        # Aceptar sin formato estricto si no cumple — validación suave
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    tenant_id: str
    db_name: str
    full_name: str
    #: Capacidades del rol, tal cual las declara `app.core.permissions`. Viajan
    #: en el login para que la UI no tenga que mantener una copia de la matriz:
    #: una copia se desincroniza y convierte un permiso en una pantalla rota.
    permissions: list[str] = []
    #: Dueño o administrador sin verificación en dos pasos: debe configurarla ya.
    mfa_setup_required: bool = False


class MfaChallenge(BaseModel):
    """La contraseña era correcta; falta el segundo paso con alguno de `methods`."""
    otp_required: bool = True
    challenge_token: str
    methods: list[str] = ["totp"]
    preferred: str | None = None
    #: Correo enmascarado (a•••@gmail.com) para decir a dónde llegó el código.
    email_hint: str | None = None


class MfaVerifyRequest(BaseModel):
    challenge_token: str
    code: str = ""
    #: Sin método se prueba app autenticadora, correo y código de respaldo.
    method: Literal["totp", "email", "backup", "passkey"] | None = None
    #: Respuesta del navegador para `passkey`.
    credential: dict | None = None


class MfaCodeRequest(BaseModel):
    code: str


class MfaDisableRequest(BaseModel):
    password: str
    code: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class AcceptInviteRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)
