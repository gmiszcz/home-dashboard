"""Schemas for hiding offers the owner does not want to see again."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.schemas.sections import SECTION_NAME_MAX_LENGTH, validate_section_name


class ExclusionRequest(BaseModel):
    section: str = Field(..., min_length=1, max_length=SECTION_NAME_MAX_LENGTH)
    offer_id: str = Field(..., min_length=1, max_length=200)
    url: str | None = Field(default=None, max_length=2_000)
    title: str | None = Field(default=None, max_length=300)

    @field_validator("section")
    @classmethod
    def clean_section(cls, value: str) -> str:
        return validate_section_name(value)

    @field_validator("offer_id")
    @classmethod
    def clean_offer_id(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("offer_id is required")
        return stripped

    @field_validator("url", "title")
    @classmethod
    def clean_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExclusionItem(BaseModel):
    offer_id: str
    url: str | None = None
    title: str | None = None
    excluded_at: str


class ExclusionResponse(BaseModel):
    status: str = "ok"
    section: str
    item: ExclusionItem


class SectionExclusionsResponse(BaseModel):
    section: str
    items: list[ExclusionItem]


class AllExclusionsResponse(BaseModel):
    sections: list[SectionExclusionsResponse]


class UnexclusionResponse(BaseModel):
    status: str = "ok"
    section: str
    offer_id: str
    removed: bool
