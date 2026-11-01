"""Item field rules for known sections. An unknown section passes through unchanged."""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime
from typing import Any

from app.timeutil import coerce_timestamp_string, is_number

PARCEL_STATUSES = frozenset({"shipped", "in_transit", "ready_for_pickup", "picked_up", "returned"})
EMAIL_GROUPS = frozenset(
    {"subscriptions_finance", "purchases", "parcels", "direct", "ai_newsletters"}
)
PRICE_AVAILABILITY = frozenset({"online_delivery", "in_store"})
GITHUB_TYPES = frozenset({"feature", "release", "fix"})
FINANCE_DIRECTIONS = frozenset({"in", "out"})
EXPENSE_CATEGORIES = frozenset(
    {
        "spożywcze",
        "drogeria",
        "paliwo",
        "jedzenie na mieście",
        "zakupy online",
        "subskrypcje",
        "przelewy",
        "dom i dziecko",
        "inne",
    }
)
EXPENSE_DAY_LABELS = frozenset({"Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"})
MAX_HISTORY_POINTS = 400

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
    "promotions": ("product", "store", "currency", "url", "image"),
    "subscriptions": ("name", "currency", "period"),
    "expenses_weekly": ("name", "currency", "period"),
    "finance": ("name", "currency", "period"),
    "family_events": ("location", "note", "priority"),
    "ai_daily": ("headline", "source", "why_it_matters", "try_it", "url", "text"),
    "ai_weekly": ("headline", "source", "why_it_matters", "try_it", "url", "text"),
    "github_weekly": ("repo", "version", "url"),
    "inbox_cleanup": (),
}

# Sections the dashboard knows about: those with item rules plus the ones without any.
KNOWN_SECTIONS = frozenset(STRING_FIELDS) | {"allegro_watch", "security_alerts"}

SECTION_NAME_MAX_LENGTH = 80


def validate_section_name(value: str) -> str:
    """Rejects control characters and slashes in a section name, returns it unchanged."""

    if any(ord(char) < 32 for char in value) or "/" in value or "\\" in value:
        raise ValueError("section contains unsupported characters")
    return value


COMMON_STRINGS = ("id", "title", "url")
MAX_ITEMS = 100
MAX_TEXT = 4_000

CALENDAR_LAYOUTS = frozenset({"days_plus_week"})
CALENDAR_PROVIDERS = frozenset({"google", "icloud"})
CALENDAR_EVENT_STRINGS = ("id", "title", "location", "calendar", "priority", "url")
MAX_CALENDAR_DAYS = 7
HEX_COLOR = re.compile(r"#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})")


def _require_str(item: dict[str, Any], field: str, label: str) -> None:
    value = item.get(field)
    if value is None:
        return
    if not isinstance(value, str):
        raise ValueError(f"{label}.{field} must be a string")
    if len(value) > MAX_TEXT:
        raise ValueError(f"{label}.{field} is too long")


def _require_bool(item: dict[str, Any], field: str, label: str) -> None:
    value = item.get(field)
    if value is None:
        return
    if not isinstance(value, bool):
        raise ValueError(f"{label}.{field} must be a boolean")


def _require_number(
    item: dict[str, Any], field: str, label: str, is_required: bool = False
) -> None:
    value = item.get(field)
    if value is None:
        if is_required:
            raise ValueError(f"{label}.{field} is required")
        return
    if not is_number(value):
        raise ValueError(f"{label}.{field} must be a number")


def _require_enum(item: dict[str, Any], field: str, allowed: frozenset[str], label: str) -> None:
    value = item.get(field)
    if value is None:
        return
    if value not in allowed:
        raise ValueError(f"{label}.{field} must be one of {sorted(allowed)}")


def _require_timestamp(item: dict[str, Any], field: str, label: str) -> None:
    if field not in item or item[field] is None:
        return
    try:
        item[field] = coerce_timestamp_string(item[field])
    except ValueError as exc:
        raise ValueError(f"{label}.{field}: {exc}") from exc


def _require_currency(item: dict[str, Any], amount_field: str, label: str) -> None:
    """Requires a currency whenever the amount field holds a value."""

    if item.get(amount_field) is not None and not item.get("currency"):
        raise ValueError(f"{label}.currency is required when {amount_field} is set")


def _validate_calendar_item(item: dict[str, Any], label: str) -> None:
    _require_bool(item, "all_day", label)
    _require_bool(item, "changed", label)


def _validate_email_item(item: dict[str, Any], label: str) -> None:
    _require_enum(item, "group", EMAIL_GROUPS, label)


def _validate_parcel_item(item: dict[str, Any], label: str) -> None:
    _require_enum(item, "status", PARCEL_STATUSES, label)
    pickup = item.get("pickup_point")
    if pickup is None:
        return
    if not isinstance(pickup, dict):
        raise ValueError(f"{label}.pickup_point must be an object")
    for key in ("name", "address"):
        value = pickup.get(key)
        if value is not None and not isinstance(value, str):
            raise ValueError(f"{label}.pickup_point.{key} must be a string")


def _validate_price_item(item: dict[str, Any], label: str) -> None:
    _require_number(item, "price", label)
    _require_number(item, "threshold", label)
    _require_enum(item, "availability", PRICE_AVAILABILITY, label)
    _require_currency(item, "price", label)


def _validate_promotion_item(item: dict[str, Any], label: str) -> None:
    _require_number(item, "price", label)
    _require_currency(item, "price", label)


def _validate_subscription_item(item: dict[str, Any], label: str) -> None:
    _require_number(item, "amount", label)
    _require_currency(item, "amount", label)


def _validate_receipt(receipt: object, label: str) -> None:
    if not isinstance(receipt, dict):
        raise ValueError(f"{label} must be an object")
    if "total" in receipt and receipt["total"] is not None and not is_number(receipt["total"]):
        raise ValueError(f"{label}.total must be a number")
    breakdown = receipt.get("breakdown")
    if breakdown is not None:
        if not isinstance(breakdown, list):
            raise ValueError(f"{label}.breakdown must be a list")
        for b_idx, b_item in enumerate(breakdown):
            b_label = f"{label}.breakdown[{b_idx}]"
            if not isinstance(b_item, dict):
                raise ValueError(f"{b_label} must be an object")
            if "subcategory" in b_item:
                _require_str(b_item, "subcategory", b_label)
            if "amount" in b_item:
                _require_number(b_item, "amount", b_label)


def _validate_expense_item(item: dict[str, Any], label: str) -> None:
    _require_number(item, "amount", label)
    _require_currency(item, "amount", label)
    _require_enum(item, "category", EXPENSE_CATEGORIES, label)
    if "receipt" in item and item["receipt"] is not None:
        _validate_receipt(item["receipt"], f"{label}.receipt")


def _validate_finance_item(item: dict[str, Any], label: str) -> None:
    _require_number(item, "amount", label)
    _require_currency(item, "amount", label)
    _require_enum(item, "direction", FINANCE_DIRECTIONS, label)


def _validate_family_event_item(item: dict[str, Any], label: str) -> None:
    _require_bool(item, "simple", label)


def _validate_github_item(item: dict[str, Any], label: str) -> None:
    _require_enum(item, "type", GITHUB_TYPES, label)


# Sections without an entry (and unknown sections) only get the common checks.
ITEM_VALIDATORS: dict[str, Callable[[dict[str, Any], str], None]] = {
    "calendar": _validate_calendar_item,
    "email_digest": _validate_email_item,
    "parcels": _validate_parcel_item,
    "prices": _validate_price_item,
    "promotions": _validate_promotion_item,
    "subscriptions": _validate_subscription_item,
    "expenses_weekly": _validate_expense_item,
    "finance": _validate_finance_item,
    "family_events": _validate_family_event_item,
    "github_weekly": _validate_github_item,
}


def _validate_common_fields(section: str, item: dict[str, Any], label: str) -> None:
    """Checks the fields shared by every section, then the section's string and timestamp lists."""

    for field in COMMON_STRINGS:
        _require_str(item, field, label)
    _require_timestamp(item, "date", label)
    status = item.get("status")
    if status is not None and not isinstance(status, str):
        raise ValueError(f"{label}.status must be a string")
    if isinstance(status, str) and status != status.lower():
        raise ValueError(f"{label}.status must be lowercase")
    extra = item.get("extra")
    if extra is not None and not isinstance(extra, dict):
        raise ValueError(f"{label}.extra must be an object")
    for field in STRING_FIELDS.get(section, ()):
        _require_str(item, field, label)
    for field in TIMESTAMP_FIELDS.get(section, ()):
        _require_timestamp(item, field, label)


def validate_items(section: str, items: list[dict[str, Any]]) -> None:
    """Validates item fields for a known section. Unknown sections pass through unchanged."""

    if len(items) > MAX_ITEMS:
        raise ValueError(f"items exceeds {MAX_ITEMS}")
    section_validator = ITEM_VALIDATORS.get(section)
    for index, item in enumerate(items):
        label = f"items[{index}]"
        if not isinstance(item, dict):
            raise ValueError(f"{label} must be an object")
        _validate_common_fields(section, item, label)
        if section_validator is not None:
            section_validator(item, label)


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


def validate_calendar_layout(payload: dict[str, Any]) -> None:
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


def _optional_date(source: dict[str, Any], key: str, label: str) -> None:
    if key not in source or source[key] is None:
        return
    _require_date(source[key], f"{label}.{key}")


def _require_list(value: object, label: str, limit: int = MAX_ITEMS) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list")
    if len(value) > limit:
        raise ValueError(f"{label} exceeds {limit}")
    return value


def _validate_category_amounts(rows: object, label: str) -> None:
    for index, row in enumerate(_require_list(rows, label)):
        row_label = f"{label}[{index}]"
        if not isinstance(row, dict):
            raise ValueError(f"{row_label} must be an object")
        if row.get("category") is None:
            raise ValueError(f"{row_label}.category is required")
        _require_enum(row, "category", EXPENSE_CATEGORIES, row_label)
        _require_number(row, "amount", row_label, is_required=True)


def _validate_expense_days(rows: object, label: str) -> None:
    for index, row in enumerate(_require_list(rows, label)):
        row_label = f"{label}[{index}]"
        if not isinstance(row, dict):
            raise ValueError(f"{row_label} must be an object")
        if row.get("date") is None:
            raise ValueError(f"{row_label}.date is required")
        _require_date(row.get("date"), f"{row_label}.date")
        if row.get("label") not in EXPENSE_DAY_LABELS:
            raise ValueError(f"{row_label}.label must be one of {sorted(EXPENSE_DAY_LABELS)}")
        if row.get("amount") is None or not is_number(row.get("amount")):
            raise ValueError(f"{row_label}.amount must be a number")


def _validate_previous_week(value: object) -> None:
    if not isinstance(value, dict):
        raise ValueError("extra.previous_week must be an object")
    label = "extra.previous_week"
    _require_str(value, "week", label)
    _optional_date(value, "week_from", label)
    _optional_date(value, "week_to", label)
    _require_number(value, "total", label)
    if value.get("by_category") is not None:
        _validate_category_amounts(value["by_category"], f"{label}.by_category")
    if value.get("by_day") is not None:
        _validate_expense_days(value["by_day"], f"{label}.by_day")
    items = value.get("items")
    if items is None:
        return
    if not isinstance(items, list):
        raise ValueError(f"{label}.items must be a list")
    validate_items("expenses_weekly", items)


def _validate_by_category_detailed(rows: object, label: str) -> None:
    for index, row in enumerate(_require_list(rows, label)):
        row_label = f"{label}[{index}]"
        if not isinstance(row, dict):
            raise ValueError(f"{row_label} must be an object")
        _require_enum(row, "category", EXPENSE_CATEGORIES, row_label)
        _require_number(row, "amount", row_label)


def _validate_expenses_extra(extra: dict[str, Any]) -> None:
    """Optional chart contract. Missing keys keep the plain list on older payloads."""

    for key in ("total", "diff_vs_previous"):
        _require_number(extra, key, "extra")
    for key in ("currency", "week"):
        _require_str(extra, key, "extra")
    for key in ("week_from", "week_to", "data_until"):
        _optional_date(extra, key, "extra")
    if extra.get("by_category") is not None:
        _validate_category_amounts(extra["by_category"], "extra.by_category")
    if extra.get("by_category_detailed") is not None:
        _validate_by_category_detailed(extra["by_category_detailed"], "extra.by_category_detailed")
    if extra.get("by_day") is not None:
        _validate_expense_days(extra["by_day"], "extra.by_day")
    if extra.get("previous_week") is not None:
        _validate_previous_week(extra["previous_week"])


def _validate_flow_days(rows: object, label: str) -> None:
    for index, row in enumerate(_require_list(rows, label, limit=400)):
        row_label = f"{label}[{index}]"
        if not isinstance(row, dict):
            raise ValueError(f"{row_label} must be an object")
        if row.get("date") is None:
            raise ValueError(f"{row_label}.date is required")
        _require_date(row.get("date"), f"{row_label}.date")
        for key in ("out", "in"):
            if key in row and row[key] is not None and not is_number(row[key]):
                raise ValueError(f"{row_label}.{key} must be a number")


def _validate_finance_extra(extra: dict[str, Any]) -> None:
    for key in ("budget", "forecast_outgoing", "balance", "incoming", "outgoing"):
        _require_number(extra, key, "extra")
    _require_str(extra, "currency", "extra")
    if extra.get("by_day") is not None:
        _validate_flow_days(extra["by_day"], "extra.by_day")


def _validate_subscriptions_extra(extra: dict[str, Any]) -> None:
    _require_number(extra, "total", "extra")
    for key in ("currency", "period"):
        _require_str(extra, key, "extra")
    rows = extra.get("next_30_days")
    if rows is None:
        return
    for index, row in enumerate(_require_list(rows, "extra.next_30_days")):
        label = f"extra.next_30_days[{index}]"
        if not isinstance(row, dict):
            raise ValueError(f"{label} must be an object")
        if row.get("date") is None:
            raise ValueError(f"{label}.date is required")
        _require_timestamp(row, "date", label)
        if not isinstance(row.get("name"), str) or not row["name"].strip():
            raise ValueError(f"{label}.name is required")
        _require_str(row, "name", label)
        _require_number(row, "amount", label, is_required=True)


def _validate_prices_extra(extra: dict[str, Any]) -> None:
    history = extra.get("history")
    if history is None:
        return
    if not isinstance(history, dict):
        raise ValueError("extra.history must be an object")
    if len(history) > MAX_ITEMS:
        raise ValueError(f"extra.history exceeds {MAX_ITEMS}")
    for product, points in history.items():
        if not isinstance(product, str) or not product.strip() or len(product) > MAX_TEXT:
            raise ValueError("extra.history keys must be product name strings")
        for index, row in enumerate(
            _require_list(points, "extra.history entry", limit=MAX_HISTORY_POINTS)
        ):
            label = f"extra.history[{index}]"
            if not isinstance(row, dict):
                raise ValueError(f"{label} must be an object")
            if row.get("date") is None:
                raise ValueError(f"{label}.date is required")
            _require_timestamp(row, "date", label)
            if row.get("price") is None or not is_number(row.get("price")):
                raise ValueError(f"{label}.price must be a number")
            _require_str(row, "store", label)


def validate_section_extra(section: str, extra: dict[str, Any]) -> None:
    if section == "inbox_cleanup":
        for key in ("archived", "left"):
            if key in extra and extra[key] is not None and not is_number(extra[key]):
                raise ValueError(f"extra.{key} must be a number")
        return
    if section == "expenses_weekly":
        _validate_expenses_extra(extra)
    elif section == "finance":
        _validate_finance_extra(extra)
    elif section == "subscriptions":
        _validate_subscriptions_extra(extra)
    elif section == "prices":
        _validate_prices_extra(extra)
