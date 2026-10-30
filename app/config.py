"""Process settings. Environment variables and the .env file, no secrets in code."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


def resolve_path(value: str) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    return ROOT / path


class Settings(BaseSettings):
    """Server configuration. Field names match the environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    dashboard_token: str = Field(min_length=8)
    db_path: str = "data/dashboard.sqlite"
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)
    read_token: str | None = None
    retention_days: int | None = Field(default=None, ge=1)
    max_body_bytes: int = Field(default=262_144, ge=1024, le=5_000_000)
    stale_after_minutes: int = Field(default=360, ge=1, le=60 * 24 * 30)
    log_level: str = "INFO"
    static_dir: str = "frontend/dist"

    @field_validator("read_token", mode="before")
    @classmethod
    def empty_read_token(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("retention_days", mode="before")
    @classmethod
    def empty_retention(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("log_level")
    @classmethod
    def normalize_level(cls, value: str) -> str:
        normalized = value.strip().upper()
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if normalized not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {sorted(allowed)}")
        return normalized

    @property
    def database_file(self) -> Path:
        return resolve_path(self.db_path)

    @property
    def static_path(self) -> Path:
        return resolve_path(self.static_dir)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
