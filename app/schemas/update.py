"""JSON envelope, schema_version 1. Unknown fields are kept (extra=allow)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.sections import (
    SECTION_NAME_MAX_LENGTH,
    validate_calendar_layout,
    validate_items,
    validate_section_extra,
    validate_section_name,
)
from app.timeutil import canonical_iso, ensure_warsaw


class UpdateIn(BaseModel):
    """A single summary of one section."""

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    schema_version: Literal[1, 2]
    section: str = Field(min_length=1, max_length=SECTION_NAME_MAX_LENGTH)
    generated_at: datetime
    source: str | None = Field(default=None, max_length=200)
    title: str | None = Field(default=None, max_length=300)
    summary: str | None = Field(default=None, max_length=4_000)
    items: list[dict[str, Any]] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)

    @field_validator("section")
    @classmethod
    def clean_section(cls, value: str) -> str:
        return validate_section_name(value)

    @field_validator("generated_at")
    @classmethod
    def warsaw_generated_at(cls, value: datetime) -> datetime:
        try:
            return ensure_warsaw(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @model_validator(mode="after")
    def check_known_sections(self) -> UpdateIn:
        validate_items(self.section, self.items)
        validate_section_extra(self.section, self.extra)
        if self.section == "calendar" and self.model_extra:
            validate_calendar_layout(self.model_extra)
        return self

    def payload(self) -> dict[str, Any]:
        data = self.model_dump(mode="json")
        data["generated_at"] = canonical_iso(self.generated_at)
        return data


class BatchIn(BaseModel):
    """Optional batch of several sections. A single POST /api/update is the primary path."""

    model_config = ConfigDict(extra="allow")

    schema_version: Literal[1, 2]
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
