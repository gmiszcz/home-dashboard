"""Schemas for section item acknowledgment."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.exclusion import ExclusionItem
from app.schemas.hidden import HiddenItem


class AckRequest(BaseModel):
    section: str = Field(..., min_length=1, max_length=100)
    item_id: str = Field(..., min_length=1, max_length=200)
    # "ack" marks an item as read, "skipped" as not interested. Any short label is accepted.
    kind: str = Field(default="ack", min_length=1, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")


class AckItem(BaseModel):
    section: str
    item_id: str
    acked_at: str
    kind: str = "ack"


class AckResponse(BaseModel):
    status: str = "ok"
    ack: AckItem


class UnackResponse(BaseModel):
    status: str = "ok"
    section: str
    item_id: str
    removed: bool


class AcksListResponse(BaseModel):
    acks: list[AckItem]


class SectionAcksResponse(BaseModel):
    """Marks plus the two offer states the bot reads before it posts.

    `not_interested` is the exclusions list (the offer stays in the section payload).
    `hidden` is the Ukryj list (the offer is removed from the served tile).
    """

    section: str
    acks: list[AckItem]
    not_interested: list[ExclusionItem] = Field(default_factory=list)
    hidden: list[HiddenItem] = Field(default_factory=list)
