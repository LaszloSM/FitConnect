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
    environment: str = "development"
    access_token_expire_minutes: int = 480
    algorithm: str = "HS256"
    anthropic_api_key: str = ""
    ses_from_email: str = ""
    cors_origins: list[str] = ["http://localhost:3000"]
    # Clave Fernet para cifrar secretos de integraciones (Wompi, WhatsApp) en gym_settings.
    # Generar con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    settings_encryption_key: str = ""
    # Wompi: sandbox por defecto; en producción cambiar a https://production.wompi.co/v1
    wompi_api_url: str = "https://sandbox.wompi.co/v1"

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
            errors.append("wompi_api_url sigue en sandbox en producción")
        if errors:
            raise ValueError("Configuración de producción insegura -> " + "; ".join(errors))
        return self


settings = Settings()
