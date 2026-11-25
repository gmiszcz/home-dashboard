"""Assignment of tiles to Patryk, Ola, or both, without republishing the tile."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.schemas.sections import (
    SECTION_NAME_MAX_LENGTH,
    canonical_profiles,
    validate_section_name,
)


class SectionProfilesRequest(BaseModel):
    """Replaces the whole section-to-profiles map. An empty map clears it."""

    sections: dict[str, list[str]] = Field(default_factory=dict, max_length=100)

    @field_validator("sections")
    @classmethod
    def clean_sections(cls, value: dict[str, list[str]]) -> dict[str, list[str]]:
        cleaned: dict[str, list[str]] = {}
        for raw_name, profiles in value.items():
            name = raw_name.strip()
            if not name:
                raise ValueError("section is required")
            if len(name) > SECTION_NAME_MAX_LENGTH:
                raise ValueError("section is too long")
            name = validate_section_name(name)
            if name in cleaned:
                raise ValueError("section is duplicated")
            cleaned[name] = canonical_profiles(profiles)
        return {name: cleaned[name] for name in sorted(cleaned)}


class SectionProfilesResponse(BaseModel):
    sections: dict[str, list[str]]
