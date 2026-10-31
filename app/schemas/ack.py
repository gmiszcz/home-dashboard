"""Schemas for section item acknowledgment."""

from pydantic import BaseModel, Field


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
    section: str
    acks: list[AckItem]
