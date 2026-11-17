"""Endpoints for offers the owner hid (Ukryj), and for tiles the bot takes off the board."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from app.api.deps import HubDep, IngestAuth, IngestOrReadAuth, ServiceDep
from app.schemas.hidden import (
    AllHiddenResponse,
    HiddenItem,
    HiddenRequest,
    HiddenResponse,
    HiddenSectionsRequest,
    HiddenSectionsResponse,
    SectionHiddenResponse,
    UnhiddenResponse,
)
from app.schemas.sections import SECTION_NAME_MAX_LENGTH, validate_section_name
from app.services.hub import ConnectionHub
from app.services.updates import UpdateService

router = APIRouter()


def _checked_section(section: str) -> str:
    try:
        return validate_section_name(section)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _item(row: dict[str, object]) -> HiddenItem:
    url = row.get("url")
    title = row.get("title")
    return HiddenItem(
        id=str(row["id"]),
        url=str(url) if isinstance(url, str) else None,
        title=str(title) if isinstance(title, str) else None,
        hidden_at=str(row["hidden_at"]),
    )


async def _broadcast_section(service: UpdateService, hub: ConnectionHub, section: str) -> None:
    """Pushes the latest row so every screen drops or restores the hidden offer."""

    rows = await run_in_threadpool(service.history, section, 1)
    if rows:
        await hub.broadcast({"type": "update", "data": rows[0]})


@router.get("/api/hidden", response_model=SectionHiddenResponse | AllHiddenResponse)
def get_hidden(
    service: ServiceDep,
    _: IngestOrReadAuth,
    section: str | None = Query(default=None, min_length=1, max_length=SECTION_NAME_MAX_LENGTH),
) -> SectionHiddenResponse | AllHiddenResponse:
    """Hidden offers. With `section`, one section; without it, every section that has any."""

    if section is not None:
        section = _checked_section(section)
        rows = service.get_hidden(section)
        return SectionHiddenResponse(section=section, items=[_item(row) for row in rows])
    grouped: dict[str, list[HiddenItem]] = {}
    for row in service.get_hidden(None):
        grouped.setdefault(str(row["section"]), []).append(_item(row))
    return AllHiddenResponse(
        sections=[
            SectionHiddenResponse(section=name, items=grouped[name]) for name in sorted(grouped)
        ]
    )


@router.post("/api/hidden", response_model=HiddenResponse)
async def post_hidden(
    req: HiddenRequest,
    service: ServiceDep,
    hub: HubDep,
    _: IngestOrReadAuth,
) -> HiddenResponse:
    """Hides an offer from the tile and lists it under Ukryte. The stored push is kept."""

    stored = await run_in_threadpool(service.hide, req.section, req.id, req.url, req.title)
    await hub.broadcast({"type": "hidden", "data": stored})
    await _broadcast_section(service, hub, req.section)
    return HiddenResponse(section=req.section, item=_item(stored))


@router.delete("/api/hidden", response_model=UnhiddenResponse)
async def delete_hidden(
    service: ServiceDep,
    hub: HubDep,
    _: IngestOrReadAuth,
    section: str = Query(..., min_length=1, max_length=SECTION_NAME_MAX_LENGTH),
    offer_id: str = Query(..., alias="id", min_length=1, max_length=200),
) -> UnhiddenResponse:
    """Restores a hidden offer. Idempotent: a missing row still returns removed=false."""

    section = _checked_section(section)
    offer_id = offer_id.strip()
    if not offer_id:
        raise HTTPException(status_code=422, detail="id is required")
    removed = await run_in_threadpool(service.restore_hidden, section, offer_id)
    await hub.broadcast({"type": "unhidden", "data": {"section": section, "id": offer_id}})
    await _broadcast_section(service, hub, section)
    return UnhiddenResponse(section=section, id=offer_id, removed=removed)


@router.get("/api/hidden-sections", response_model=HiddenSectionsResponse)
def get_hidden_sections(
    service: ServiceDep,
    _: IngestOrReadAuth,
) -> HiddenSectionsResponse:
    """Section names the bot has taken off the board. Sorted. Empty when nothing is concealed."""

    return HiddenSectionsResponse(sections=service.get_hidden_sections())


@router.post("/api/hidden-sections", response_model=HiddenSectionsResponse)
async def post_hidden_sections(
    req: HiddenSectionsRequest,
    service: ServiceDep,
    hub: HubDep,
    _: IngestAuth,
) -> HiddenSectionsResponse:
    """Replaces the concealed-tile list. An empty list shows every tile again."""

    return await _store_hidden_sections(req, service, hub)


@router.put("/api/hidden-sections", response_model=HiddenSectionsResponse)
async def put_hidden_sections(
    req: HiddenSectionsRequest,
    service: ServiceDep,
    hub: HubDep,
    _: IngestAuth,
) -> HiddenSectionsResponse:
    """Same replacement as POST. The bot can use either verb."""

    return await _store_hidden_sections(req, service, hub)


async def _store_hidden_sections(
    req: HiddenSectionsRequest,
    service: UpdateService,
    hub: ConnectionHub,
) -> HiddenSectionsResponse:
    names = await run_in_threadpool(service.set_hidden_sections, req.sections)
    await hub.broadcast({"type": "hidden-sections", "data": {"sections": names}})
    return HiddenSectionsResponse(sections=names)
