"""Schemas for saving items to favorites."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FavoriteRequest(BaseModel):
    section: str = Field(..., min_length=1, max_length=100)
    item_id: str = Field(..., min_length=1, max_length=200)
    item_data: dict[str, Any] = Field(default_factory=dict)


class FavoriteItem(BaseModel):
    section: str
    item_id: str
    saved_at: str
    item_data: dict[str, Any] = Field(default_factory=dict)


class FavoriteResponse(BaseModel):
    status: str = "ok"
    favorite: FavoriteItem


class UnfavoriteResponse(BaseModel):
    status: str = "ok"
    section: str
    item_id: str
    removed: bool


class FavoritesListResponse(BaseModel):
    favorites: list[FavoriteItem]
