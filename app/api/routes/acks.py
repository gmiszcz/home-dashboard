"""Endpoints for acknowledging (marking as read) items in sections."""

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import HubDep, IngestAuth, ReadAuth, ServiceDep
from app.schemas.ack import (
    AckItem,
    AckRequest,
    AckResponse,
    AcksListResponse,
    SectionAcksResponse,
)
from app.schemas.sections import KNOWN_SECTIONS

router = APIRouter()


@router.post("/api/ack", response_model=AckResponse)
async def post_ack(
    req: AckRequest,
    service: ServiceDep,
    hub: HubDep,
    _: ReadAuth,
) -> AckResponse:
    stored = service.ack(req.section, req.item_id)
    await hub.broadcast({"type": "ack", "data": stored})
    return AckResponse(ack=AckItem(**stored))


@router.get("/api/ack", response_model=SectionAcksResponse)
def get_section_acks(
    service: ServiceDep,
    _: IngestAuth,
    section: str = Query(...),
) -> SectionAcksResponse:
    """Marks stored for one section, so the sender can read user state before it posts."""

    if section not in KNOWN_SECTIONS:
        raise HTTPException(
            status_code=422, detail=f"unknown section, use one of {sorted(KNOWN_SECTIONS)}"
        )
    rows = service.get_acks(section)
    return SectionAcksResponse(section=section, acks=[AckItem(**r) for r in rows])


@router.get("/api/acks", response_model=AcksListResponse)
def get_acks(
    service: ServiceDep,
    _: ReadAuth,
    section: str | None = Query(default=None),
) -> AcksListResponse:
    rows = service.get_acks(section)
    return AcksListResponse(acks=[AckItem(**r) for r in rows])
