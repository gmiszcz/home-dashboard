"""Schemas for section item acknowledgment."""

from pydantic import BaseModel, Field


class AckRequest(BaseModel):
    section: str = Field(..., min_length=1, max_length=100)
    item_id: str = Field(..., min_length=1, max_length=200)


class AckItem(BaseModel):
    section: str
    item_id: str
    acked_at: str


class AckResponse(BaseModel):
    status: str = "ok"
    ack: AckItem


class AcksListResponse(BaseModel):
    acks: list[AckItem]
