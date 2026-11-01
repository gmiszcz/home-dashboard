"""Endpoints for bookmarking / saving items to favorites."""

from __future__ import annotations

from fastapi import APIRouter, Query
from starlette.concurrency import run_in_threadpool

from app.api.deps import HubDep, ReadAuth, ServiceDep
from app.schemas.favorite import (
    FavoriteItem,
    FavoriteRequest,
    FavoriteResponse,
    FavoritesListResponse,
    UnfavoriteResponse,
)

router = APIRouter()


@router.post("/api/favorites", response_model=FavoriteResponse)
async def post_favorite(
    req: FavoriteRequest,
    service: ServiceDep,
    hub: HubDep,
    _: ReadAuth,
) -> FavoriteResponse:
    stored = await run_in_threadpool(service.save_favorite, req.section, req.item_id, req.item_data)
    await hub.broadcast({"type": "favorite", "data": stored})
    return FavoriteResponse(favorite=FavoriteItem(**stored))


@router.delete("/api/favorites", response_model=UnfavoriteResponse)
async def delete_favorite(
    service: ServiceDep,
    hub: HubDep,
    _: ReadAuth,
    section: str = Query(..., min_length=1, max_length=100),
    item_id: str = Query(..., min_length=1, max_length=200),
) -> UnfavoriteResponse:
    removed = await run_in_threadpool(service.remove_favorite, section, item_id)
    await hub.broadcast({"type": "unfavorite", "data": {"section": section, "item_id": item_id}})
    return UnfavoriteResponse(section=section, item_id=item_id, removed=removed)


@router.get("/api/favorites", response_model=FavoritesListResponse)
def get_favorites(
    service: ServiceDep,
    _: ReadAuth,
    section: str | None = Query(default=None, max_length=100),
) -> FavoritesListResponse:
    rows = service.get_favorites(section)
    return FavoritesListResponse(favorites=[FavoriteItem(**r) for r in rows])
