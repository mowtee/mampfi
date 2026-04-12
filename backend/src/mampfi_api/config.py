from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "development"
    log_level: str = "info"

    database_url: str = "postgresql+psycopg://mampfi:mampfi@db:5432/mampfi"
    secret_key: str = "change-me"

    # Auth
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    frontend_url: str = "http://localhost:5173"
    cookie_secure: bool = True
    cookie_domain: str | None = None

    cors_origins: str | None = None  # comma-separated

    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    mail_from: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
