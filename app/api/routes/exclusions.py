"""Endpoints for offers the owner marked as not interesting."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from app.api.deps import HubDep, IngestOrReadAuth, ServiceDep
from app.schemas.exclusion import (
    AllExclusionsResponse,
    ExclusionItem,
    ExclusionRequest,
    ExclusionResponse,
    SectionExclusionsResponse,
    UnexclusionResponse,
)
from app.schemas.sections import SECTION_NAME_MAX_LENGTH, validate_section_name

router = APIRouter()


def _checked_section(section: str) -> str:
    try:
        return validate_section_name(section)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _item(row: dict[str, object]) -> ExclusionItem:
    url = row.get("url")
    title = row.get("title")
    return ExclusionItem(
        offer_id=str(row["offer_id"]),
        url=str(url) if isinstance(url, str) else None,
        title=str(title) if isinstance(title, str) else None,
        excluded_at=str(row["excluded_at"]),
    )


@router.get(
    "/api/exclusions",
    response_model=SectionExclusionsResponse | AllExclusionsResponse,
)
def get_exclusions(
    service: ServiceDep,
    _: IngestOrReadAuth,
    section: str | None = Query(default=None, min_length=1, max_length=SECTION_NAME_MAX_LENGTH),
) -> SectionExclusionsResponse | AllExclusionsResponse:
    """Offers marked "Nie interesuje mnie". With `section`, one section; without it, every section."""

    if section is not None:
        section = _checked_section(section)
        rows = service.get_exclusions(section)
        return SectionExclusionsResponse(section=section, items=[_item(row) for row in rows])
    grouped: dict[str, list[ExclusionItem]] = {}
    for row in service.get_exclusions(None):
        grouped.setdefault(str(row["section"]), []).append(_item(row))
    return AllExclusionsResponse(
        sections=[
            SectionExclusionsResponse(section=name, items=grouped[name]) for name in sorted(grouped)
        ]
    )


@router.post("/api/exclusions", response_model=ExclusionResponse)
async def post_exclusion(
    req: ExclusionRequest,
    service: ServiceDep,
    hub: HubDep,
    _: IngestOrReadAuth,
) -> ExclusionResponse:
    """Marks an offer as not interesting. The offer stays in the section payload."""

    stored = await run_in_threadpool(service.exclude, req.section, req.offer_id, req.url, req.title)
    await hub.broadcast({"type": "exclusion", "data": stored})
    return ExclusionResponse(section=req.section, item=_item(stored))


@router.delete("/api/exclusions", response_model=UnexclusionResponse)
async def delete_exclusion(
    service: ServiceDep,
    hub: HubDep,
    _: IngestOrReadAuth,
    section: str = Query(..., min_length=1, max_length=SECTION_NAME_MAX_LENGTH),
    offer_id: str = Query(..., min_length=1, max_length=200),
) -> UnexclusionResponse:
    """Restores an offer. Idempotent: a missing row still returns removed=false."""

    section = _checked_section(section)
    offer_id = offer_id.strip()
    if not offer_id:
        raise HTTPException(status_code=422, detail="offer_id is required")
    removed = await run_in_threadpool(service.restore_exclusion, section, offer_id)
    await hub.broadcast({"type": "unexclusion", "data": {"section": section, "offer_id": offer_id}})
    return UnexclusionResponse(section=section, offer_id=offer_id, removed=removed)
