import logging
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore",
        protected_namespaces=("model_",),
    )

    # Master DB: contiene tenants, owners, subscriptions
    master_database_url: str
    # Template para tenant DBs: {db_name} se reemplaza con el slug del gym
    # Ej: postgresql+asyncpg://gymuser:gympass@db:5432/{db_name}
    tenant_database_url_template: str
    # Fallback DB (para dev cuando no hay tenant aún)
    database_url: str = ""

    redis_url: str
    secret_key: str
    # Tipado cerrado a propósito: el compose arrancaba con "prod", que no es
    # ninguno de estos, y el guard de abajo (que compara con "production") nunca
    # corría. Producción quedó dos meses sin validar su propia configuración.
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    # Si está activo, el backend corre `alembic upgrade head` del Master al arrancar
    # (con advisory lock para que solo una réplica migre). Default False: en dev la
    # Master ya existe y puede tener drift. En prod (RDS fresco) se activa por env.
    run_migrations_on_startup: bool = False
    # Sentry opcional: si está vacío, no se inicializa (no requiere cuenta).
    sentry_dsn: str = ""
    access_token_expire_minutes: int = 480
    # TTL del token efímero del SSE de recepción (segundos).
    realtime_token_ttl_seconds: int = 120
    algorithm: str = "HS256"
    anthropic_api_key: str = ""
    ses_from_email: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]
    # URL pública del frontend, para construir links (ej. invitaciones de staff).
    frontend_url: str = "http://localhost:3000"
    # URL pública de la API (enlaces firmados enviados por WhatsApp)
    public_api_url: str = "http://localhost:8000"
    # Clave Fernet para cifrar secretos de integraciones (Wompi, WhatsApp) en gym_settings.
    # Generar con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    settings_encryption_key: str = ""
    # Wompi: sandbox por defecto; en producción cambiar a https://production.wompi.co/v1
    wompi_api_url: str = "https://sandbox.wompi.co/v1"

    # Almacenamiento de objetos S3-compatible (MinIO local / S3 en prod).
    # s3_endpoint_url vacío => boto3 usa AWS S3 real (prod).
    s3_endpoint_url: str = ""
    s3_public_url: str = ""
    s3_bucket: str = "fitconnect-media"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    @model_validator(mode="after")
    def _guard_production_defaults(self) -> "Settings":
        """Falla al arrancar si se despliega a producción con defaults inseguros.
        En desarrollo no aplica (los defaults son válidos para local)."""
        if self.environment != "production":
            return self
        errors = []
        if not self.settings_encryption_key:
            errors.append("settings_encryption_key vacío: no se pueden cifrar los secretos de Wompi/WhatsApp")
        if any("localhost" in o or "127.0.0.1" in o for o in self.cors_origins):
            errors.append(f"cors_origins apunta a localhost en producción: {self.cors_origins}")
        if "sandbox.wompi.co" in self.wompi_api_url:
            # Excepción temporal: todavía no hay cuenta de Wompi de producción, así
            # que esto avisa en vez de impedir el arranque. Cuando exista la cuenta,
            # mover esta línea de vuelta a `errors` y borrar el warning.
            # Ojo: las llaves de Wompi son POR GYM (cifradas en gym_settings), pero
            # esta URL es de plataforma. Si un gym configura llaves de producción
            # mientras esto siga en sandbox, sus cobros fallan sin explicación.
            logging.getLogger(__name__).warning(
                "wompi_api_url apunta a sandbox en producción: los pagos en línea NO cobran de verdad"
            )
        if errors:
            raise ValueError("Configuración de producción insegura -> " + "; ".join(errors))
        return self


settings = Settings()
