"""Offer tiles: one renderer for every offer search, including legacy gabinety and domki."""

from __future__ import annotations

from typing import Any

OFFER_RENDERER = "offers"

# Sections pushed before the offers renderer existed. They keep their names.
LEGACY_OFFER_SECTIONS = frozenset({"gabinety", "domki"})

# Old Polish keys the panel still sends. The canonical name wins when both are present.
LEGACY_ITEM_FIELDS = (
    ("nazwa", "title"),
    ("link", "url"),
    ("cena", "price"),
    ("lokalizacja", "location"),
    ("opis", "description"),
)


def is_offer_tile(payload: dict[str, Any]) -> bool:
    """True when this row should be drawn and filtered as an offer tile."""

    if payload.get("renderer") == OFFER_RENDERER or payload.get("type") == OFFER_RENDERER:
        return True
    return payload.get("section") in LEGACY_OFFER_SECTIONS


def _blank(value: object) -> bool:
    if value is None:
        return True
    return isinstance(value, str) and not value.strip()


def _as_text(value: object) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return str(value)
    return None


def normalize_offer_item(item: dict[str, Any]) -> dict[str, Any]:
    """Copy an item into the canonical offer shape. Original keys stay."""

    normalized = dict(item)
    for old, new in LEGACY_ITEM_FIELDS:
        if not _blank(normalized.get(new)):
            continue
        if new == "price":
            text = _as_text(item.get(old))
            if text is not None:
                normalized[new] = text
            continue
        mapped = item.get(old)
        if isinstance(mapped, str) and mapped.strip():
            normalized[new] = mapped.strip()
    if _blank(normalized.get("description")):
        for key in ("text", "subtitle", "opis"):
            text = _as_text(normalized.get(key))
            if text is not None:
                normalized["description"] = text
                break
    price = normalized.get("price")
    if not isinstance(price, str):
        text = _as_text(price)
        if text is not None:
            normalized["price"] = text
    offer_id = normalized.get("id")
    if isinstance(offer_id, str):
        stripped = offer_id.strip()
        if stripped:
            normalized["id"] = stripped
    elif isinstance(offer_id, (int, float)) and not isinstance(offer_id, bool):
        normalized["id"] = str(offer_id)
    return normalized


def present_update(row: dict[str, Any]) -> dict[str, Any]:
    """Serve an offer tile with legacy fields mapped.

    Not-interested and hidden marks are not applied here. The offer stays in the
    payload so the screen can draw the full card and put it back on restore.
    The bot tells the two marks apart from the ack and hidden endpoints.
    """

    if not is_offer_tile(row):
        return row
    raw_items = row.get("items")
    items = raw_items if isinstance(raw_items, list) else []
    kept: list[Any] = []
    for item in items:
        if not isinstance(item, dict):
            kept.append(item)
            continue
        kept.append(normalize_offer_item(item))
    presented = dict(row)
    presented["items"] = kept
    if presented.get("renderer") != OFFER_RENDERER and presented.get("type") != OFFER_RENDERER:
        presented["renderer"] = OFFER_RENDERER
    summary = presented.get("summary")
    subtitle = presented.get("subtitle")
    if _blank(summary) and isinstance(subtitle, str) and subtitle.strip():
        presented["summary"] = subtitle.strip()
    return presented
