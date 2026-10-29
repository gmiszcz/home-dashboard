"""Koperta JSON schema_version 1. Nieznane pola zostają (extra=allow)."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.sections import validate_items, validate_section_extra
from app.timeutil import canonical_iso, ensure_warsaw


class UpdateIn(BaseModel):
    """Pojedyncze podsumowanie jednej sekcji."""

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    schema_version: Literal[1]
    section: str = Field(min_length=1, max_length=80)
    generated_at: datetime
    source: str | None = Field(default=None, max_length=200)
    title: str | None = Field(default=None, max_length=300)
    summary: str | None = Field(default=None, max_length=4_000)
    items: list[dict[str, Any]] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)

    @field_validator("section")
    @classmethod
    def clean_section(cls, value: str) -> str:
        if any(ord(char) < 32 for char in value) or "/" in value or "\\" in value:
            raise ValueError("section contains unsupported characters")
        return value

    @field_validator("generated_at")
    @classmethod
    def warsaw_generated_at(cls, value: datetime) -> datetime:
        try:
            return ensure_warsaw(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @model_validator(mode="after")
    def check_known_sections(self) -> "UpdateIn":
        validate_items(self.section, self.items)
        validate_section_extra(self.section, self.extra)
        return self

    def payload(self) -> dict[str, Any]:
        data = self.model_dump(mode="json")
        data["generated_at"] = canonical_iso(self.generated_at)
        return data


class BatchIn(BaseModel):
    """Opcjonalna paczka wielu sekcji. Pojedynczy POST /api/update jest ścieżką podstawową."""

    model_config = ConfigDict(extra="allow")

    schema_version: Literal[1]
    sent_at: datetime
    messages: list[UpdateIn] = Field(min_length=1, max_length=50)

    @field_validator("sent_at")
    @classmethod
    def warsaw_sent_at(cls, value: datetime) -> datetime:
        try:
            return ensure_warsaw(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class UpdateAck(BaseModel):
    id: int


class BatchAck(BaseModel):
    ids: list[int]
