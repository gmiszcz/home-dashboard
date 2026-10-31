"""Ingest of Ryuk's envelopes and reads of the latest rows."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query

from app.api.deps import HubDep, IngestAuth, ReadAuth, ServiceDep
from app.schemas.update import BatchAck, BatchIn, UpdateAck, UpdateIn

router = APIRouter()


@router.post("/api/update", response_model=UpdateAck)
async def post_update(
    message: UpdateIn,
    service: ServiceDep,
    hub: HubDep,
    _: IngestAuth,
) -> UpdateAck:
    stored, created = service.store(message)
    if created:
        await hub.broadcast({"type": "update", "data": stored})
    return UpdateAck(id=stored["id"])


@router.post("/api/updates", response_model=BatchAck)
async def post_updates(
    batch: BatchIn,
    service: ServiceDep,
    hub: HubDep,
    _: IngestAuth,
) -> BatchAck:
    ids: list[int] = []
    fresh: list[dict[str, Any]] = []
    for message in batch.messages:
        stored, created = service.store(message)
        ids.append(stored["id"])
        if created:
            fresh.append(stored)
    for stored in fresh:
        await hub.broadcast({"type": "update", "data": stored})
    return BatchAck(ids=ids)


@router.get("/api/latest")
def get_latest(service: ServiceDep, _: ReadAuth) -> dict[str, Any]:
    return {"sections": service.latest()}


@router.get("/api/section/{name}")
def get_section(
    name: Annotated[str, Path(max_length=80)],
    service: ServiceDep,
    _: ReadAuth,
    limit: int = Query(default=20, ge=1, le=200),
) -> dict[str, Any]:
    return {"section": name, "updates": service.history(name, limit)}
