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


def item_url(item: dict[str, Any]) -> str | None:
    for key in ("url", "link"):
        text = _as_text(item.get(key))
        if text is not None:
            return text
    return None


def item_offer_id(item: dict[str, Any]) -> str | None:
    offer_id = item.get("id")
    if isinstance(offer_id, str) and offer_id.strip():
        return offer_id.strip()
    if isinstance(offer_id, (int, float)) and not isinstance(offer_id, bool):
        return str(offer_id)
    return None


def item_hidden(item: dict[str, Any], hidden: list[dict[str, Any]]) -> bool:
    """Match the stable offer id, and the url when both sides have one."""

    offer_id = item_offer_id(item)
    url = item_url(item)
    for row in hidden:
        stored = row.get("id")
        if stored is None:
            stored = row.get("offer_id")
        if offer_id is not None and offer_id == stored:
            return True
        hidden_url = row.get("url")
        if url is not None and isinstance(hidden_url, str) and hidden_url == url:
            return True
    return False


def present_update(row: dict[str, Any], hidden: list[dict[str, Any]]) -> dict[str, Any]:
    """Serve an offer tile with legacy fields mapped and hidden offers removed.

    Exclusions ("Nie interesuje mnie") stay in the payload. The screen drops those
    cards locally, and the bot still reads the offer from this row.
    Hidden offers (Ukryj) are removed here. The stored row is unchanged, so
    restoring one shows it from the same push.
    """

    if not is_offer_tile(row):
        return row
    section = row.get("section")
    mine = [row_hidden for row_hidden in hidden if row_hidden.get("section") == section]
    raw_items = row.get("items")
    items = raw_items if isinstance(raw_items, list) else []
    kept: list[Any] = []
    for item in items:
        if not isinstance(item, dict):
            kept.append(item)
            continue
        normalized = normalize_offer_item(item)
        if item_hidden(normalized, mine):
            continue
        kept.append(normalized)
    presented = dict(row)
    presented["items"] = kept
    if presented.get("renderer") != OFFER_RENDERER and presented.get("type") != OFFER_RENDERER:
        presented["renderer"] = OFFER_RENDERER
    summary = presented.get("summary")
    subtitle = presented.get("subtitle")
    if _blank(summary) and isinstance(subtitle, str) and subtitle.strip():
        presented["summary"] = subtitle.strip()
    return presented
