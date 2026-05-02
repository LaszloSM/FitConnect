from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    secret_key: str
    environment: str = "development"
    access_token_expire_minutes: int = 480  # 8 horas
    algorithm: str = "HS256"
    anthropic_api_key: str = ""
    ses_from_email: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
