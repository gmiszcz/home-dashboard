"""Endpoints for acknowledging (marking as read) items in sections."""

from fastapi import APIRouter, Query

from app.api.deps import HubDep, ReadAuth, ServiceDep
from app.schemas.ack import AckItem, AckRequest, AckResponse, AcksListResponse

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


@router.get("/api/acks", response_model=AcksListResponse)
def get_acks(
    service: ServiceDep,
    _: ReadAuth,
    section: str | None = Query(default=None),
) -> AcksListResponse:
    rows = service.get_acks(section)
    return AcksListResponse(acks=[AckItem(**r) for r in rows])
