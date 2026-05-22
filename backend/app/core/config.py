from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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


settings = Settings()
