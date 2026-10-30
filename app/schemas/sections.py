"""Item field rules for known sections. An unknown section passes through unchanged."""

import re
from datetime import datetime

from app.timeutil import coerce_timestamp_string, is_number

PARCEL_STATUSES = frozenset({"shipped", "in_transit", "ready_for_pickup", "picked_up", "returned"})
EMAIL_GROUPS = frozenset(
    {"subscriptions_finance", "purchases", "parcels", "direct", "ai_newsletters"}
)
PRICE_AVAILABILITY = frozenset({"online_delivery", "in_store"})
GITHUB_TYPES = frozenset({"feature", "release", "fix"})

MONEY_SECTIONS = frozenset({"prices", "promotions", "subscriptions", "expenses_weekly", "finance"})

TIMESTAMP_FIELDS: dict[str, tuple[str, ...]] = {
    "calendar": ("start", "end"),
    "parcels": ("deadline",),
    "promotions": ("valid_from", "valid_to"),
    "subscriptions": ("next_charge",),
    "expenses_weekly": ("next_charge",),
    "finance": ("next_charge",),
}

STRING_FIELDS: dict[str, tuple[str, ...]] = {
    "calendar": ("location", "calendar"),
    "email_digest": ("from", "subject", "note"),
    "parcels": ("carrier", "shop", "tracking_number", "pickup_code"),
    "prices": ("product", "store", "currency", "url"),
    "promotions": ("product", "store", "currency", "url"),
    "subscriptions": ("name", "currency", "period"),
    "expenses_weekly": ("name", "currency", "period"),
    "finance": ("name", "currency", "period"),
    "ai_daily": ("headline", "source", "why_it_matters", "try_it", "url", "text"),
    "ai_weekly": ("headline", "source", "why_it_matters", "try_it", "url", "text"),
    "github_weekly": ("repo", "version", "url"),
    "inbox_cleanup": (),
}

COMMON_STRINGS = ("id", "title", "url")
MAX_ITEMS = 100
MAX_TEXT = 4_000

CALENDAR_LAYOUTS = frozenset({"days_plus_week"})
CALENDAR_PROVIDERS = frozenset({"google", "icloud"})
CALENDAR_EVENT_STRINGS = ("id", "title", "location", "calendar", "priority", "url")
MAX_CALENDAR_DAYS = 7
HEX_COLOR = re.compile(r"#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})")


def _require_str(item: dict, field: str, label: str) -> None:
    value = item.get(field)
    if value is None:
        return
    if not isinstance(value, str):
        raise ValueError(f"{label}.{field} must be a string")
    if len(value) > MAX_TEXT:
        raise ValueError(f"{label}.{field} is too long")


def _require_bool(item: dict, field: str, label: str) -> None:
    value = item.get(field)
    if value is None:
        return
    if not isinstance(value, bool):
        raise ValueError(f"{label}.{field} must be a boolean")


def _require_number(item: dict, field: str, label: str) -> None:
    value = item.get(field)
    if value is None:
        return
    if not is_number(value):
        raise ValueError(f"{label}.{field} must be a number")


def _require_enum(item: dict, field: str, allowed: frozenset[str], label: str) -> None:
    value = item.get(field)
    if value is None:
        return
    if value not in allowed:
        raise ValueError(f"{label}.{field} must be one of {sorted(allowed)}")


def _require_timestamp(item: dict, field: str, label: str) -> None:
    if field not in item or item[field] is None:
        return
    try:
        item[field] = coerce_timestamp_string(item[field])
    except ValueError as exc:
        raise ValueError(f"{label}.{field}: {exc}") from exc


def validate_items(section: str, items: list[dict]) -> None:
    if len(items) > MAX_ITEMS:
        raise ValueError(f"items exceeds {MAX_ITEMS}")
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"items[{index}] must be an object")
        label = f"items[{index}]"
        for field in COMMON_STRINGS:
            _require_str(item, field, label)
        if "date" in item and item["date"] is not None:
            _require_timestamp(item, "date", label)
        if "status" in item and item["status"] is not None and not isinstance(item["status"], str):
            raise ValueError(f"{label}.status must be a string")
        if isinstance(item.get("status"), str) and item["status"] != item["status"].lower():
            raise ValueError(f"{label}.status must be lowercase")
        extra = item.get("extra")
        if extra is not None and not isinstance(extra, dict):
            raise ValueError(f"{label}.extra must be an object")
        for field in STRING_FIELDS.get(section, ()):
            _require_str(item, field, label)
        for field in TIMESTAMP_FIELDS.get(section, ()):
            _require_timestamp(item, field, label)
        if section == "calendar":
            _require_bool(item, "all_day", label)
            _require_bool(item, "changed", label)
        elif section == "email_digest":
            _require_enum(item, "group", EMAIL_GROUPS, label)
        elif section == "parcels":
            _require_enum(item, "status", PARCEL_STATUSES, label)
            pickup = item.get("pickup_point")
            if pickup is not None:
                if not isinstance(pickup, dict):
                    raise ValueError(f"{label}.pickup_point must be an object")
                for key in ("name", "address"):
                    if (
                        key in pickup
                        and pickup[key] is not None
                        and not isinstance(pickup[key], str)
                    ):
                        raise ValueError(f"{label}.pickup_point.{key} must be a string")
        elif section == "prices":
            _require_number(item, "price", label)
            _require_number(item, "threshold", label)
            _require_enum(item, "availability", PRICE_AVAILABILITY, label)
            if item.get("price") is not None and not item.get("currency"):
                raise ValueError(f"{label}.currency is required when price is set")
        elif section == "promotions":
            _require_number(item, "price", label)
            if item.get("price") is not None and not item.get("currency"):
                raise ValueError(f"{label}.currency is required when price is set")
        elif section in {"subscriptions", "expenses_weekly", "finance"}:
            _require_number(item, "amount", label)
            if item.get("amount") is not None and not item.get("currency"):
                raise ValueError(f"{label}.currency is required when amount is set")
        elif section == "github_weekly":
            _require_enum(item, "type", GITHUB_TYPES, label)

    if section == "inbox_cleanup":
        return


def _require_date(value: object, label: str) -> str:
    """Requires a plain YYYY-MM-DD calendar date."""

    if not isinstance(value, str):
        raise ValueError(f"{label} must be a YYYY-MM-DD date")
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"{label} must be a YYYY-MM-DD date") from exc
    return value


def _validate_events(events: object, first_day: str, last_day: str, label: str) -> None:
    """Checks calendar events and requires each start date (Warsaw) within [first_day, last_day]."""

    if not isinstance(events, list):
        raise ValueError(f"{label} must be a list")
    if len(events) > MAX_ITEMS:
        raise ValueError(f"{label} exceeds {MAX_ITEMS}")
    for index, event in enumerate(events):
        event_label = f"{label}[{index}]"
        if not isinstance(event, dict):
            raise ValueError(f"{event_label} must be an object")
        for field in CALENDAR_EVENT_STRINGS:
            _require_str(event, field, event_label)
        for field in ("all_day", "simple", "changed"):
            _require_bool(event, field, event_label)
        _require_enum(event, "provider", CALENDAR_PROVIDERS, event_label)
        color = event.get("color")
        if color is not None and (not isinstance(color, str) or not HEX_COLOR.fullmatch(color)):
            raise ValueError(f"{event_label}.color must be a hex color like #4CD964")
        if not event.get("start"):
            raise ValueError(f"{event_label}.start is required")
        for field in ("start", "end"):
            _require_timestamp(event, field, event_label)
        # Canonical timestamps are in Warsaw time, so the first 10 characters are the local date.
        start_day = event["start"][:10]
        if not first_day <= start_day <= last_day:
            span = first_day if first_day == last_day else f"{first_day}..{last_day}"
            raise ValueError(f"{event_label}.start {start_day} is outside {span}")


def validate_calendar_layout(payload: dict) -> None:
    """Validates the optional days/week calendar layout. Mutates timestamps to canonical form."""

    layout = payload.get("layout")
    days = payload.get("days")
    week = payload.get("week")
    if layout is None and days is None and week is None:
        return
    if layout is not None and layout not in CALENDAR_LAYOUTS:
        raise ValueError(f"layout must be one of {sorted(CALENDAR_LAYOUTS)}")
    if not isinstance(days, list):
        raise ValueError("days must be a list")
    if len(days) > MAX_CALENDAR_DAYS:
        raise ValueError(f"days exceeds {MAX_CALENDAR_DAYS}")
    for index, day in enumerate(days):
        label = f"days[{index}]"
        if not isinstance(day, dict):
            raise ValueError(f"{label} must be an object")
        date = _require_date(day.get("date"), f"{label}.date")
        _require_str(day, "label", label)
        _validate_events(day.get("events", []), date, date, f"{label}.events")
    if week is None:
        return
    if not isinstance(week, dict):
        raise ValueError("week must be an object")
    first_day = _require_date(week.get("from"), "week.from")
    last_day = _require_date(week.get("to"), "week.to")
    if first_day > last_day:
        raise ValueError("week.from must not be after week.to")
    _validate_events(week.get("events", []), first_day, last_day, "week.events")


def validate_section_extra(section: str, extra: dict) -> None:
    if section != "inbox_cleanup":
        return
    for key in ("archived", "left"):
        if key in extra and extra[key] is not None and not is_number(extra[key]):
            raise ValueError(f"extra.{key} must be a number")
