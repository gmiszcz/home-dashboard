"""Schemas for offers the owner hid from the tile (Ukryj), separate from exclusions."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.schemas.sections import SECTION_NAME_MAX_LENGTH, validate_section_name


class HiddenRequest(BaseModel):
    section: str = Field(..., min_length=1, max_length=SECTION_NAME_MAX_LENGTH)
    id: str = Field(..., min_length=1, max_length=200)
    url: str | None = Field(default=None, max_length=2_000)
    title: str | None = Field(default=None, max_length=300)

    @field_validator("section")
    @classmethod
    def clean_section(cls, value: str) -> str:
        return validate_section_name(value)

    @field_validator("id")
    @classmethod
    def clean_id(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("id is required")
        return stripped

    @field_validator("url", "title")
    @classmethod
    def clean_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class HiddenItem(BaseModel):
    id: str
    url: str | None = None
    title: str | None = None
    hidden_at: str


class HiddenResponse(BaseModel):
    status: str = "ok"
    section: str
    item: HiddenItem


class SectionHiddenResponse(BaseModel):
    section: str
    items: list[HiddenItem]


class AllHiddenResponse(BaseModel):
    sections: list[SectionHiddenResponse]


class UnhiddenResponse(BaseModel):
    status: str = "ok"
    section: str
    id: str
    removed: bool


class HiddenSectionsRequest(BaseModel):
    """Replaces the whole list of tiles the bot wants off the board."""

    sections: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("sections")
    @classmethod
    def clean_sections(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for name in value:
            stripped = name.strip()
            if not stripped:
                raise ValueError("section is required")
            if len(stripped) > SECTION_NAME_MAX_LENGTH:
                raise ValueError("section is too long")
            cleaned.append(validate_section_name(stripped))
        return cleaned


class HiddenSectionsResponse(BaseModel):
    sections: list[str]
