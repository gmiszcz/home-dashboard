"""Which profile a tile belongs to. Ryuk sets this without posting the tile again."""

from __future__ import annotations

from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from app.api.deps import HubDep, IngestAuth, IngestOrReadAuth, ServiceDep
from app.schemas.profiles import SectionProfilesRequest, SectionProfilesResponse
from app.services.hub import ConnectionHub
from app.services.updates import UpdateService

router = APIRouter()


@router.get("/api/section-profiles", response_model=SectionProfilesResponse)
def get_section_profiles(
    service: ServiceDep,
    _: IngestOrReadAuth,
) -> SectionProfilesResponse:
    """Section to profile list. Empty when every tile still follows its own payload."""

    return SectionProfilesResponse(sections=service.get_section_profiles())


@router.put("/api/section-profiles", response_model=SectionProfilesResponse)
async def put_section_profiles(
    req: SectionProfilesRequest,
    service: ServiceDep,
    hub: HubDep,
    _: IngestAuth,
) -> SectionProfilesResponse:
    """Replaces the map. A section missing from the body falls back to the tile payload."""

    return await _store_section_profiles(req, service, hub)


async def _store_section_profiles(
    req: SectionProfilesRequest,
    service: UpdateService,
    hub: ConnectionHub,
) -> SectionProfilesResponse:
    sections = await run_in_threadpool(service.set_section_profiles, req.sections)
    await hub.broadcast({"type": "section-profiles", "data": {"sections": sections}})
    return SectionProfilesResponse(sections=sections)
