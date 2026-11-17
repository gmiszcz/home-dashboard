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
PAYSLIP_GROUPS = frozenset(
    {"net", "pit", "zus", "zdrowotna", "ppk", "zfss", "other", "addition", "earning", "info"}
)
PAYSLIP_KINDS = frozenset({"earning", "deduction", "addition", "net", "info"})
MONTH_KEY = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
MAX_HISTORY_POINTS = 400

MONEY_SECTIONS = frozenset(
    {"prices", "promotions", "subscriptions", "expenses_weekly", "expenses_monthly", "finance"}
)

TIMESTAMP_FIELDS: dict[str, tuple[str, ...]] = {
    "calendar": ("start", "end"),
    "parcels": ("deadline",),
    "promotions": ("valid_from", "valid_to"),
    "subscriptions": ("next_charge",),
    "expenses_weekly": ("next_charge",),
    "expenses_monthly": ("next_charge",),
    "finance": ("next_charge",),
    "job_offers": ("posted_at", "expires_at", "first_seen"),
}

STRING_FIELDS: dict[str, tuple[str, ...]] = {
    "calendar": ("location", "calendar"),
    "email_digest": ("from", "subject", "note"),
    "parcels": ("carrier", "shop", "tracking_number", "pickup_code"),
    "prices": ("product", "store", "currency", "url"),
    "promotions": ("product", "store", "currency", "url", "image"),
    "subscriptions": ("name", "currency", "period"),
    "expenses_weekly": ("name", "currency", "period"),
    "expenses_monthly": ("name", "currency", "period"),
    "finance": ("name", "currency", "period"),
    "family_events": ("location", "note", "priority"),
    "ai_daily": ("headline", "source", "why_it_matters", "try_it", "url", "text"),
    "ai_weekly": ("headline", "source", "why_it_matters", "try_it", "url", "text"),
    "github_weekly": ("repo", "version", "url"),
    "payslip": ("name", "currency", "code", "note"),
    "prad": ("note",),
    "job_offers": (
        "company",
        "city",
        "address",
        "source",
        "url",
        "work_time",
        "text",
        "why_it_matters",
        "priority",
    ),
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
# A month can carry far more transactions than a week (October had 112), so the
# monthly expenses section gets a higher ceiling. Other sections keep MAX_ITEMS.
MAX_ITEMS_BY_SECTION: dict[str, int] = {"expenses_monthly": 500}
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
    _require_enum(item, "category", EXPENSE_CATEGORIES, label)
    if "receipt" in item and item["receipt"] is not None:
        _validate_receipt(item["receipt"], f"{label}.receipt")


def _validate_family_event_item(item: dict[str, Any], label: str) -> None:
    _require_bool(item, "simple", label)


def _validate_github_item(item: dict[str, Any], label: str) -> None:
    _require_enum(item, "type", GITHUB_TYPES, label)


def _validate_payslip_item(item: dict[str, Any], label: str) -> None:
    _require_number(item, "amount", label)
    _require_currency(item, "amount", label)
    _require_enum(item, "kind", PAYSLIP_KINDS, label)
    _require_enum(item, "group", PAYSLIP_GROUPS, label)


def _validate_job_offer_item(item: dict[str, Any], label: str) -> None:
    for field in ("is_new", "simple", "pinned"):
        _require_bool(item, field, label)
    _require_number(item, "match_score", label)
    for field in ("contract", "match_reasons", "concerns"):
        value = item.get(field)
        if value is not None and not isinstance(value, list):
            raise ValueError(f"{label}.{field} must be a list")
    salary = item.get("salary")
    if salary is None:
        return
    if not isinstance(salary, dict):
        raise ValueError(f"{label}.salary must be an object or null")
    for key in ("min", "max"):
        value = salary.get(key)
        if value is not None and not is_number(value):
            raise ValueError(f"{label}.salary.{key} must be a number")
    for key in ("currency", "period", "raw"):
        value = salary.get(key)
        if value is not None and not isinstance(value, str):
            raise ValueError(f"{label}.salary.{key} must be a string")


# Sections without an entry (and unknown sections) only get the common checks.
ITEM_VALIDATORS: dict[str, Callable[[dict[str, Any], str], None]] = {
    "calendar": _validate_calendar_item,
    "email_digest": _validate_email_item,
    "parcels": _validate_parcel_item,
    "prices": _validate_price_item,
    "promotions": _validate_promotion_item,
    "subscriptions": _validate_subscription_item,
    "expenses_weekly": _validate_expense_item,
    "expenses_monthly": _validate_expense_item,
    "finance": _validate_finance_item,
    "family_events": _validate_family_event_item,
    "github_weekly": _validate_github_item,
    "job_offers": _validate_job_offer_item,
    "payslip": _validate_payslip_item,
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

    limit = MAX_ITEMS_BY_SECTION.get(section, MAX_ITEMS)
    if len(items) > limit:
        raise ValueError(f"items exceeds {limit}")
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


def _validate_expense_days(rows: object, label: str, *, weekday_label: bool = True) -> None:
    """Validates expense day bars.

    The weekly tile labels each bar with a weekday ("Pn".."Nd"). The monthly tile
    labels bars with the calendar day ("DD.MM") and carries the weekday separately,
    so for months the strict weekday-label check is skipped (weekday_label=False).
    """

    limit = MAX_ITEMS if weekday_label else 400
    for index, row in enumerate(_require_list(rows, label, limit=limit)):
        row_label = f"{label}[{index}]"
        if not isinstance(row, dict):
            raise ValueError(f"{row_label} must be an object")
        if row.get("date") is None:
            raise ValueError(f"{row_label}.date is required")
        _require_date(row.get("date"), f"{row_label}.date")
        if weekday_label:
            if row.get("label") not in EXPENSE_DAY_LABELS:
                raise ValueError(f"{row_label}.label must be one of {sorted(EXPENSE_DAY_LABELS)}")
        else:
            _require_str(row, "label", row_label)
            weekday = row.get("weekday")
            if weekday is not None and weekday not in EXPENSE_DAY_LABELS:
                raise ValueError(f"{row_label}.weekday must be one of {sorted(EXPENSE_DAY_LABELS)}")
        for key in ("out", "in"):
            if key in row and row[key] is not None and not is_number(row[key]):
                raise ValueError(f"{row_label}.{key} must be a number")
        if weekday_label:
            if row.get("amount") is None or not is_number(row.get("amount")):
                raise ValueError(f"{row_label}.amount must be a number")
        else:
            # Monthly bars carry the spent amount as `amount` or, for flow-style
            # rows, as `out`. At least one must be a number.
            bar = row.get("amount") if row.get("amount") is not None else row.get("out")
            if bar is None or not is_number(bar):
                raise ValueError(f"{row_label}.amount or out must be a number")


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


def _validate_receipts_summary(value: object, label: str) -> None:
    if value is None:
        return
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    _require_number(value, "count", label)
    _require_number(value, "covered_amount", label)


def _validate_previous_month_expenses(value: object) -> None:
    """Previous month block for the expenses_monthly section (mirrors the weekly one)."""

    if not isinstance(value, dict):
        raise ValueError("extra.previous_month must be an object")
    label = "extra.previous_month"
    _require_str(value, "month", label)
    _optional_date(value, "month_from", label)
    _optional_date(value, "month_to", label)
    total = value.get("total") if value.get("total") is not None else value.get("outgoing")
    if total is None or not is_number(total):
        raise ValueError(f"{label}.total or outgoing must be a number")
    if value.get("by_category") is not None:
        _validate_category_amounts(value["by_category"], f"{label}.by_category")
    if value.get("by_category_detailed") is not None:
        _validate_by_category_detailed(
            value["by_category_detailed"], f"{label}.by_category_detailed"
        )
    _validate_receipts_summary(value.get("receipts"), f"{label}.receipts")
    if value.get("by_day") is not None:
        _validate_expense_days(value["by_day"], f"{label}.by_day", weekday_label=False)
    items = value.get("items")
    if items is None:
        return
    if not isinstance(items, list):
        raise ValueError(f"{label}.items must be a list")
    validate_items("expenses_monthly", items)


def _validate_expenses_monthly_extra(extra: dict[str, Any]) -> None:
    """Monthly chart contract. Same shape as weekly but over a calendar month."""

    for key in ("total", "diff_vs_previous"):
        _require_number(extra, key, "extra")
    _require_str(extra, "currency", "extra")
    _require_str(extra, "month", "extra")
    for key in ("month_from", "month_to", "data_until"):
        _optional_date(extra, key, "extra")
    if extra.get("by_category") is not None:
        _validate_category_amounts(extra["by_category"], "extra.by_category")
    if extra.get("by_category_detailed") is not None:
        _validate_by_category_detailed(extra["by_category_detailed"], "extra.by_category_detailed")
    _validate_receipts_summary(extra.get("receipts"), "extra.receipts")
    if extra.get("by_day") is not None:
        _validate_expense_days(extra["by_day"], "extra.by_day", weekday_label=False)
    if extra.get("previous_month") is not None:
        _validate_previous_month_expenses(extra["previous_month"])


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


def _validate_previous_month(value: object) -> None:
    if not isinstance(value, dict):
        raise ValueError("extra.previous_month must be an object")
    label = "extra.previous_month"
    _require_str(value, "month", label)
    _optional_date(value, "month_from", label)
    _optional_date(value, "month_to", label)
    total = value.get("total") if value.get("total") is not None else value.get("outgoing")
    if total is None or not is_number(total):
        raise ValueError(f"{label}.total or outgoing must be a number")
    if value.get("by_category") is not None:
        _validate_category_amounts(value["by_category"], f"{label}.by_category")
    if value.get("by_day") is not None:
        try:
            _validate_flow_days(value["by_day"], f"{label}.by_day")
        except ValueError:
            _validate_expense_days(value["by_day"], f"{label}.by_day")
    items = value.get("items")
    if items is None:
        return
    if not isinstance(items, list):
        raise ValueError(f"{label}.items must be a list")
    validate_items("finance", items)


def _validate_finance_extra(extra: dict[str, Any]) -> None:
    for key in (
        "budget",
        "forecast_outgoing",
        "balance",
        "incoming",
        "outgoing",
        "total",
        "diff_vs_previous",
    ):
        _require_number(extra, key, "extra")
    for key in ("currency", "month"):
        _require_str(extra, key, "extra")
    for key in ("month_from", "month_to", "data_until"):
        _optional_date(extra, key, "extra")
    if extra.get("by_day") is not None:
        _validate_flow_days(extra["by_day"], "extra.by_day")
    if extra.get("by_category") is not None:
        _validate_category_amounts(extra["by_category"], "extra.by_category")
    if extra.get("by_category_detailed") is not None:
        _validate_by_category_detailed(extra["by_category_detailed"], "extra.by_category_detailed")
    if extra.get("previous_month") is not None:
        _validate_previous_month(extra["previous_month"])


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


def _validate_job_offers_extra(extra: dict[str, Any]) -> None:
    for key in ("total_active", "new_today"):
        if key in extra and extra[key] is not None and not is_number(extra[key]):
            raise ValueError(f"extra.{key} must be a number")
    # sources_checked is either a count or a list of portal names.
    sources = extra.get("sources_checked")
    if sources is not None and not is_number(sources) and not isinstance(sources, list):
        raise ValueError("extra.sources_checked must be a number or a list")
    if extra.get("last_search") is not None:
        _require_timestamp(extra, "last_search", "extra")


def _require_month(value: object, label: str) -> None:
    if not isinstance(value, str) or MONTH_KEY.fullmatch(value) is None:
        raise ValueError(f"{label} must be a YYYY-MM month")


def _validate_payslip_line(row: object, label: str) -> None:
    if not isinstance(row, dict):
        raise ValueError(f"{label} must be an object")
    if not isinstance(row.get("label"), str) or not str(row.get("label")).strip():
        raise ValueError(f"{label}.label is required")
    _require_str(row, "label", label)
    _require_str(row, "code", label)
    _require_enum(row, "group", PAYSLIP_GROUPS, label)
    _require_number(row, "amount", label, is_required=True)


def _validate_payslip_lines(rows: object, label: str) -> None:
    for index, row in enumerate(_require_list(rows, label)):
        _validate_payslip_line(row, f"{label}[{index}]")


def _validate_payslip_history(rows: object, label: str) -> None:
    for index, row in enumerate(_require_list(rows, label, limit=MAX_HISTORY_POINTS)):
        row_label = f"{label}[{index}]"
        if not isinstance(row, dict):
            raise ValueError(f"{row_label} must be an object")
        if row.get("month") is None:
            raise ValueError(f"{row_label}.month is required")
        _require_month(row.get("month"), f"{row_label}.month")
        for key in ("gross", "net", "pit", "deductions_total", "additions_total"):
            _require_number(row, key, row_label)


def _validate_payslip_diff(value: object, label: str) -> None:
    """A single delta (like the expense tiles) or one number per payslip field."""

    if value is None or is_number(value):
        return
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a number or an object")
    if len(value) > 40:
        raise ValueError(f"{label} has too many fields")
    for key, item in value.items():
        if not isinstance(key, str) or not key.strip() or len(key) > 40:
            raise ValueError(f"{label} keys must be short strings")
        if item is not None and not is_number(item):
            raise ValueError(f"{label}.{key} must be a number")


_PAYSLIP_NUMBERS = (
    "gross",
    "net",
    "deductions_total",
    "additions_total",
    "ytd_income",
    "hours_nominal",
    "hours_leave",
    "home_office_days",
    "employment_rate",
    "pit_rate",
    "tax_relief",
    "tax_costs",
)


def _validate_payslip_block(block: dict[str, Any], label: str, *, with_items: bool) -> None:
    if "month" in block and block["month"] is not None:
        _require_month(block["month"], f"{label}.month")
    for key in _PAYSLIP_NUMBERS:
        _require_number(block, key, label)
    for key in ("currency", "employer"):
        _require_str(block, key, label)
    if block.get("deductions") is not None:
        _validate_payslip_lines(block["deductions"], f"{label}.deductions")
    if block.get("components") is not None:
        _validate_payslip_lines(block["components"], f"{label}.components")
    if not with_items or block.get("items") is None:
        return
    items = block["items"]
    if not isinstance(items, list):
        raise ValueError(f"{label}.items must be a list")
    validate_items("payslip", items)


def _validate_payslip_extra(extra: dict[str, Any]) -> None:
    """Payslip chart contract. Missing keys keep a plain list of line items."""

    _validate_payslip_block(extra, "extra", with_items=False)
    if extra.get("history") is not None:
        _validate_payslip_history(extra["history"], "extra.history")
    if "diff_vs_previous" in extra:
        _validate_payslip_diff(extra["diff_vs_previous"], "extra.diff_vs_previous")
    previous = extra.get("previous_month")
    if previous is None:
        return
    if not isinstance(previous, dict):
        raise ValueError("extra.previous_month must be an object")
    _validate_payslip_block(previous, "extra.previous_month", with_items=True)
    if previous.get("previous_month") is not None:
        raise ValueError("extra.previous_month.previous_month is not allowed")
    if previous.get("history") is not None:
        _validate_payslip_history(previous["history"], "extra.previous_month.history")
    if "diff_vs_previous" in previous:
        _validate_payslip_diff(
            previous["diff_vs_previous"], "extra.previous_month.diff_vs_previous"
        )


def _validate_energy_invoice(row: object, label: str) -> None:
    """One Tauron document. Only kind `invoice` is charted; other kinds stay on the list."""

    if not isinstance(row, dict):
        raise ValueError(f"{label} must be an object")
    number = row.get("number")
    if not isinstance(number, str) or not number.strip():
        raise ValueError(f"{label}.number is required")
    _require_str(row, "number", label)
    kind = row.get("kind")
    if not isinstance(kind, str) or not kind.strip():
        raise ValueError(f"{label}.kind is required")
    _require_str(row, "kind", label)
    if len(kind) > 40:
        raise ValueError(f"{label}.kind is too long")
    for key in ("issued", "period_from", "period_to", "due"):
        _optional_date(row, key, label)
    for key in ("kwh", "sales", "distribution", "total", "average_per_kwh"):
        _require_number(row, key, label)
    status = row.get("status")
    if status is not None and (
        not isinstance(status, str) or status != status.lower() or len(status) > 40
    ):
        raise ValueError(f"{label}.status must be a short lowercase string")
    for key in ("source_file", "note"):
        _require_str(row, key, label)
    start = row.get("period_from")
    end = row.get("period_to")
    if isinstance(start, str) and isinstance(end, str) and start > end:
        raise ValueError(f"{label}.period_from must not be after period_to")


EXPENSE_BLOCK_TYPES = frozenset(
    {"kpi", "bars", "donut", "line", "table", "list", "text", "note", "drilldown", "diff"}
)
EXPENSE_TONES = frozenset({"good", "bad"})
EXPENSE_HERO_TONES = frozenset({"good", "bad", "neutral"})
EXPENSE_DIFF_TONES = frozenset({"good", "bad", "neutral", "auto"})
MAX_EXPENSE_VIEWS = 8
MAX_EXPENSE_HERO_LINES = 6
MAX_EXPENSE_BLOCKS = 30
MAX_EXPENSE_POINTS = 36
MAX_EXPENSE_SERIES = 4
MAX_EXPENSE_SEGMENTS = 12
MAX_EXPENSE_KPIS = 8
MAX_EXPENSE_ROWS = 40
MAX_EXPENSE_COLUMNS = 8
MAX_EXPENSE_LIST = 40
_LABEL_LIMIT = 80


def validate_hidden_flag(value: object) -> None:
    """Top-level `hidden` on a section payload. Absent or null means shown."""

    if value is None:
        return
    if not isinstance(value, bool):
        raise ValueError("hidden must be a boolean")


def _optional_label(
    item: dict[str, Any], field: str, label: str, limit: int = _LABEL_LIMIT
) -> None:
    value = item.get(field)
    if value is None:
        return
    if not isinstance(value, str):
        raise ValueError(f"{label}.{field} must be a string")
    if len(value) > limit:
        raise ValueError(f"{label}.{field} is too long")


def _finite_number(value: object, label: str) -> None:
    if not is_number(value):
        raise ValueError(f"{label} must be a number")
    number = float(value)  # type: ignore[arg-type]
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"{label} must be a finite number")


def _color(value: object, label: str) -> None:
    if value is None:
        return
    if not isinstance(value, str) or HEX_COLOR.fullmatch(value) is None:
        raise ValueError(f"{label} must be a hex color")


def _validate_hero(hero: object, label: str) -> None:
    if not isinstance(hero, dict):
        raise ValueError(f"{label} must be an object")
    value = hero.get("value")
    if isinstance(value, str):
        if not value.strip() or len(value) > _LABEL_LIMIT:
            raise ValueError(f"{label}.value is too long")
    elif not is_number(value):
        raise ValueError(f"{label}.value must be a string or a number")
    _optional_label(hero, "label", label)
    tone = hero.get("tone")
    if tone is not None and tone not in EXPENSE_HERO_TONES:
        raise ValueError(f"{label}.tone must be good, bad or neutral")
    side = hero.get("side")
    if side is not None:
        if not isinstance(side, dict):
            raise ValueError(f"{label}.side must be an object")
        side_text = side.get("text")
        if not isinstance(side_text, str) or not side_text.strip() or len(side_text) > 80:
            raise ValueError(f"{label}.side.text is required")
        side_tone = side.get("tone")
        if side_tone is not None and side_tone not in EXPENSE_HERO_TONES:
            raise ValueError(f"{label}.side.tone must be good, bad or neutral")
    lines = hero.get("lines")
    if lines is None:
        return
    if not isinstance(lines, list) or len(lines) > MAX_EXPENSE_HERO_LINES:
        raise ValueError(f"{label}.lines must be a short list")
    for index, line in enumerate(lines):
        line_label = f"{label}.lines[{index}]"
        if not isinstance(line, dict):
            raise ValueError(f"{line_label} must be an object")
        text = line.get("text")
        if not isinstance(text, str) or not text.strip() or len(text) > 160:
            raise ValueError(f"{line_label}.text is required")
        line_tone = line.get("tone")
        if line_tone is not None and line_tone not in EXPENSE_HERO_TONES:
            raise ValueError(f"{line_label}.tone must be good, bad or neutral")


def _validate_kpi_block(block: dict[str, Any], label: str) -> None:
    hero = block.get("hero")
    if hero is not None:
        _validate_hero(hero, f"{label}.hero")
    items = block.get("items")
    if items is None:
        items = []
    if not isinstance(items, list):
        raise ValueError(f"{label}.items must be a list")
    if not items and hero is None:
        raise ValueError(f"{label}.items must be a non-empty list")
    if len(items) > MAX_EXPENSE_KPIS:
        raise ValueError(f"{label}.items exceeds {MAX_EXPENSE_KPIS}")
    for index, item in enumerate(items):
        item_label = f"{label}.items[{index}]"
        if not isinstance(item, dict):
            raise ValueError(f"{item_label} must be an object")
        name = item.get("label")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"{item_label}.label is required")
        if len(name) > _LABEL_LIMIT:
            raise ValueError(f"{item_label}.label is too long")
        value = item.get("value")
        if isinstance(value, str):
            if not value.strip() or len(value) > _LABEL_LIMIT:
                raise ValueError(f"{item_label}.value is too long")
        elif not is_number(value):
            raise ValueError(f"{item_label}.value must be a string or a number")
        _optional_label(item, "delta", item_label, 40)
        _optional_bool(item, "emphasis", item_label)
        tone = item.get("tone")
        if tone is not None and tone not in EXPENSE_TONES:
            raise ValueError(f"{item_label}.tone must be one of {sorted(EXPENSE_TONES)}")


def _validate_bar_point(value: object, label: str) -> None:
    if isinstance(value, dict):
        _finite_number(value.get("value"), f"{label}.value")
        tone = value.get("tone")
        if tone is not None and tone not in EXPENSE_TONES:
            raise ValueError(f"{label}.tone must be good or bad")
        return
    _finite_number(value, label)


def _optional_bool(item: dict[str, Any], field: str, label: str) -> None:
    value = item.get(field)
    if value is None:
        return
    if not isinstance(value, bool):
        raise ValueError(f"{label}.{field} must be a boolean")


def _validate_bar_series(
    series: object, labels: list[object], label: str, allow_empty: bool
) -> None:
    if not isinstance(series, list) or (not series and not allow_empty):
        raise ValueError(f"{label} must be a non-empty list")
    if len(series) > MAX_EXPENSE_SERIES:
        raise ValueError(f"{label} exceeds {MAX_EXPENSE_SERIES}")
    for index, entry in enumerate(series):
        series_label = f"{label}[{index}]"
        if not isinstance(entry, dict):
            raise ValueError(f"{series_label} must be an object")
        _optional_label(entry, "name", series_label)
        _color(entry.get("color"), f"{series_label}.color")
        values = entry.get("values")
        if not isinstance(values, list) or len(values) != len(labels):
            raise ValueError(f"{series_label}.values must have one number per label")
        for point, value in enumerate(values):
            _validate_bar_point(value, f"{series_label}.values[{point}]")
        tones = entry.get("tones")
        if tones is None:
            continue
        if not isinstance(tones, list) or len(tones) != len(values):
            raise ValueError(f"{series_label}.tones must match values")
        for point, tone in enumerate(tones):
            if tone is not None and tone not in EXPENSE_TONES:
                raise ValueError(f"{series_label}.tones[{point}] must be good or bad")


def _validate_bars_block(block: dict[str, Any], label: str) -> None:
    labels = block.get("labels")
    if not isinstance(labels, list) or not labels:
        raise ValueError(f"{label}.labels must be a non-empty list")
    if len(labels) > MAX_EXPENSE_POINTS:
        raise ValueError(f"{label}.labels exceeds {MAX_EXPENSE_POINTS}")
    for index, name in enumerate(labels):
        if not isinstance(name, str) or not name.strip() or len(name) > _LABEL_LIMIT:
            raise ValueError(f"{label}.labels[{index}] must be a short string")
    _validate_bar_series(block.get("series"), labels, f"{label}.series", False)
    line_series = block.get("line_series")
    if line_series is not None:
        _validate_bar_series(line_series, labels, f"{label}.line_series", True)
    _optional_label(block, "unit", label, 24)
    _optional_bool(block, "show_values", label)
    _optional_bool(block, "trend", label)
    _optional_bool(block, "sign_tone", label)
    highlight = block.get("highlight")
    if highlight is None:
        return
    if isinstance(highlight, bool) or not isinstance(highlight, int):
        raise ValueError(f"{label}.highlight must be an index")
    if highlight < 0 or highlight >= len(labels):
        raise ValueError(f"{label}.highlight is out of range")


def _validate_donut_block(block: dict[str, Any], label: str) -> None:
    segments = block.get("segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError(f"{label}.segments must be a non-empty list")
    if len(segments) > MAX_EXPENSE_SEGMENTS:
        raise ValueError(f"{label}.segments exceeds {MAX_EXPENSE_SEGMENTS}")
    for index, segment in enumerate(segments):
        segment_label = f"{label}.segments[{index}]"
        if not isinstance(segment, dict):
            raise ValueError(f"{segment_label} must be an object")
        name = segment.get("label")
        if not isinstance(name, str) or not name.strip() or len(name) > _LABEL_LIMIT:
            raise ValueError(f"{segment_label}.label must be a short string")
        _finite_number(segment.get("value"), f"{segment_label}.value")
        _color(segment.get("color"), f"{segment_label}.color")
    center = block.get("center")
    if isinstance(center, str):
        if len(center) > 40:
            raise ValueError(f"{label}.center is too long")
    elif center is not None:
        if isinstance(center, bool):
            raise ValueError(f"{label}.center must be a string or a number")
        _finite_number(center, f"{label}.center")
    decimals = block.get("center_decimals")
    if decimals is not None and (
        isinstance(decimals, bool) or not isinstance(decimals, int) or decimals < 0 or decimals > 2
    ):
        raise ValueError(f"{label}.center_decimals must be 0, 1 or 2")


def _validate_line_block(block: dict[str, Any], label: str) -> None:
    values = block.get("values")
    if not isinstance(values, list) or not values:
        raise ValueError(f"{label}.values must be a non-empty list")
    if len(values) > MAX_EXPENSE_POINTS:
        raise ValueError(f"{label}.values exceeds {MAX_EXPENSE_POINTS}")
    for index, value in enumerate(values):
        _finite_number(value, f"{label}.values[{index}]")
    labels = block.get("labels")
    if labels is None:
        return
    if not isinstance(labels, list) or len(labels) != len(values):
        raise ValueError(f"{label}.labels must have one string per value")
    for index, name in enumerate(labels):
        if not isinstance(name, str) or len(name) > _LABEL_LIMIT:
            raise ValueError(f"{label}.labels[{index}] must be a short string")


def _validate_table_block(block: dict[str, Any], label: str) -> None:
    columns = block.get("columns")
    if not isinstance(columns, list) or not columns:
        raise ValueError(f"{label}.columns must be a non-empty list")
    if len(columns) > MAX_EXPENSE_COLUMNS:
        raise ValueError(f"{label}.columns exceeds {MAX_EXPENSE_COLUMNS}")
    for index, name in enumerate(columns):
        if not isinstance(name, str) or not name.strip() or len(name) > _LABEL_LIMIT:
            raise ValueError(f"{label}.columns[{index}] must be a short string")
    rows = block.get("rows")
    if not isinstance(rows, list):
        raise ValueError(f"{label}.rows must be a list")
    if len(rows) > MAX_EXPENSE_ROWS:
        raise ValueError(f"{label}.rows exceeds {MAX_EXPENSE_ROWS}")
    width = len(columns)
    for index, row in enumerate(rows):
        row_label = f"{label}.rows[{index}]"
        cells = row
        if isinstance(row, dict):
            cells = row.get("cells")
            comment = row.get("comment")
            if comment is not None and (not isinstance(comment, str) or len(comment) > 200):
                raise ValueError(f"{row_label}.comment must be a short string")
        if not isinstance(cells, list) or len(cells) > width:
            raise ValueError(f"{row_label} must be a list no wider than columns")
        for cell_index, cell in enumerate(cells):
            if isinstance(cell, str):
                if len(cell) > 200:
                    raise ValueError(f"{row_label}[{cell_index}] is too long")
            elif not is_number(cell):
                raise ValueError(f"{row_label}[{cell_index}] must be a string or a number")


def _validate_list_block(block: dict[str, Any], label: str) -> None:
    items = block.get("items")
    if not isinstance(items, list):
        raise ValueError(f"{label}.items must be a list")
    if len(items) > MAX_EXPENSE_LIST:
        raise ValueError(f"{label}.items exceeds {MAX_EXPENSE_LIST}")
    for index, item in enumerate(items):
        item_label = f"{label}.items[{index}]"
        if not isinstance(item, dict):
            raise ValueError(f"{item_label} must be an object")
        name = item.get("label")
        if not isinstance(name, str) or not name.strip() or len(name) > 200:
            raise ValueError(f"{item_label}.label must be a short string")
        amount = item.get("amount")
        if amount is not None and not isinstance(amount, str) and not is_number(amount):
            raise ValueError(f"{item_label}.amount must be a string or a number")
        if isinstance(amount, str) and len(amount) > _LABEL_LIMIT:
            raise ValueError(f"{item_label}.amount is too long")
        _optional_label(item, "date", item_label, 40)
        _optional_label(item, "comment", item_label, 200)
        status = item.get("status")
        if status is None:
            continue
        if not isinstance(status, str) or status != status.lower() or len(status) > 24:
            raise ValueError(f"{item_label}.status must be a short lowercase string")


def _validate_text_block(block: dict[str, Any], label: str) -> None:
    text = block.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"{label}.text is required")
    if len(text) > MAX_TEXT:
        raise ValueError(f"{label}.text is too long")


def _validate_diff_block(block: dict[str, Any], label: str) -> None:
    items = block.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError(f"{label}.items must be a non-empty list")
    if len(items) > MAX_EXPENSE_LIST:
        raise ValueError(f"{label}.items exceeds {MAX_EXPENSE_LIST}")
    for index, item in enumerate(items):
        item_label = f"{label}.items[{index}]"
        if not isinstance(item, dict):
            raise ValueError(f"{item_label} must be an object")
        name = item.get("label")
        if not isinstance(name, str) or not name.strip() or len(name) > _LABEL_LIMIT:
            raise ValueError(f"{item_label}.label must be a short string")
        value = item.get("value")
        if isinstance(value, str):
            if not value.strip() or len(value) > _LABEL_LIMIT:
                raise ValueError(f"{item_label}.value is too long")
        elif not is_number(value):
            raise ValueError(f"{item_label}.value must be a string or a number")
        delta = item.get("delta")
        if isinstance(delta, str):
            if len(delta) > 40:
                raise ValueError(f"{item_label}.delta is too long")
        elif delta is not None:
            _finite_number(delta, f"{item_label}.delta")
        if "delta_pct" in item and item.get("delta_pct") is not None:
            _finite_number(item.get("delta_pct"), f"{item_label}.delta_pct")
        tone = item.get("tone")
        if tone is not None and tone not in EXPENSE_DIFF_TONES:
            raise ValueError(f"{item_label}.tone must be good, bad, neutral or auto")


def _validate_expense_block(block: object, label: str) -> None:
    if not isinstance(block, dict):
        raise ValueError(f"{label} must be an object")
    kind = block.get("type")
    if kind not in EXPENSE_BLOCK_TYPES:
        raise ValueError(f"{label}.type must be one of {sorted(EXPENSE_BLOCK_TYPES)}")
    _optional_label(block, "id", label, 80)
    _optional_label(block, "title", label, 120)
    if kind == "kpi":
        _validate_kpi_block(block, label)
    elif kind == "bars":
        _validate_bars_block(block, label)
    elif kind == "donut":
        _validate_donut_block(block, label)
    elif kind == "line":
        _validate_line_block(block, label)
    elif kind == "table":
        _validate_table_block(block, label)
    elif kind == "list":
        _validate_list_block(block, label)
    elif kind == "drilldown":
        _validate_drilldown_block(block, label)
    elif kind == "diff":
        _validate_diff_block(block, label)
    else:
        _validate_text_block(block, label)


def _validate_drilldown_block(block: dict[str, Any], label: str) -> None:
    labels = block.get("labels")
    if not isinstance(labels, list) or not labels:
        raise ValueError(f"{label}.labels must be a non-empty list")
    if len(labels) > MAX_EXPENSE_POINTS:
        raise ValueError(f"{label}.labels exceeds {MAX_EXPENSE_POINTS}")
    for index, name in enumerate(labels):
        if not isinstance(name, str) or not name.strip() or len(name) > _LABEL_LIMIT:
            raise ValueError(f"{label}.labels[{index}] must be a short string")
    _optional_label(block, "unit", label, 24)
    items = block.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError(f"{label}.items must be a non-empty list")
    if len(items) > MAX_EXPENSE_LIST:
        raise ValueError(f"{label}.items exceeds {MAX_EXPENSE_LIST}")
    ids: list[str] = []
    for index, item in enumerate(items):
        item_label = f"{label}.items[{index}]"
        if not isinstance(item, dict):
            raise ValueError(f"{item_label} must be an object")
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id.strip() or len(item_id) > _LABEL_LIMIT:
            raise ValueError(f"{item_label}.id must be a short string")
        ids.append(item_id)
        name = item.get("label")
        if not isinstance(name, str) or not name.strip() or len(name) > _LABEL_LIMIT:
            raise ValueError(f"{item_label}.label must be a short string")
        share = item.get("share_pct")
        if share is not None:
            _finite_number(share, f"{item_label}.share_pct")
        _optional_label(item, "change", item_label, 40)
        series = item.get("series")
        if not isinstance(series, list) or len(series) != len(labels):
            raise ValueError(f"{item_label}.series must have one number per label")
        for point, value in enumerate(series):
            _finite_number(value, f"{item_label}.series[{point}]")
    selected = block.get("selected")
    if selected is None:
        return
    if not isinstance(selected, str) or selected not in ids:
        raise ValueError(f"{label}.selected must match an item id")


def _validate_expense_views(payload: dict[str, Any], block_count: int, ids: set[str]) -> None:
    views = payload.get("views")
    default_view = payload.get("default_view")
    if views is None:
        if default_view is not None:
            raise ValueError("default_view requires views")
        return
    if not isinstance(views, list) or not views:
        raise ValueError("views must be a non-empty list")
    if len(views) > MAX_EXPENSE_VIEWS:
        raise ValueError(f"views exceeds {MAX_EXPENSE_VIEWS}")
    seen: list[str] = []
    for index, view in enumerate(views):
        label = f"views[{index}]"
        if not isinstance(view, dict):
            raise ValueError(f"{label} must be an object")
        view_id = view.get("id")
        if not isinstance(view_id, str) or not view_id.strip() or len(view_id) > _LABEL_LIMIT:
            raise ValueError(f"{label}.id must be a short string")
        if view_id in seen:
            raise ValueError(f"{label}.id is duplicated")
        seen.append(view_id)
        name = view.get("label")
        if not isinstance(name, str) or not name.strip() or len(name) > _LABEL_LIMIT:
            raise ValueError(f"{label}.label must be a short string")
        refs = view.get("blocks")
        if not isinstance(refs, list) or not refs:
            raise ValueError(f"{label}.blocks must be a non-empty list")
        for point, ref in enumerate(refs):
            ref_label = f"{label}.blocks[{point}]"
            if isinstance(ref, bool):
                raise ValueError(f"{ref_label} must be a block id or index")
            if isinstance(ref, int):
                if ref < 0 or ref >= block_count:
                    raise ValueError(f"{ref_label} is out of range")
                continue
            if not isinstance(ref, str) or ref not in ids:
                raise ValueError(f"{ref_label} must match a block id")
    if default_view is None:
        return
    if not isinstance(default_view, str) or default_view not in seen:
        raise ValueError("default_view must match a view id")


def validate_expenses_tile(payload: dict[str, Any]) -> None:
    """Checks a generic expenses tile (`renderer` or `type` is `expenses`)."""

    blocks = payload.get("blocks")
    if not isinstance(blocks, list):
        raise ValueError("blocks must be a list")
    if len(blocks) > MAX_EXPENSE_BLOCKS:
        raise ValueError(f"blocks exceeds {MAX_EXPENSE_BLOCKS}")
    _optional_label(payload, "period", "expenses", 80)
    total = payload.get("total")
    if isinstance(total, str):
        if len(total) > _LABEL_LIMIT:
            raise ValueError("total is too long")
    elif total is not None:
        _finite_number(total, "total")
    currency = payload.get("currency")
    if currency is not None and (not isinstance(currency, str) or len(currency) > 16):
        raise ValueError("currency must be a short string")
    _optional_bool(payload, "show_total", "expenses")
    ids: list[str] = []
    for index, block in enumerate(blocks):
        _validate_expense_block(block, f"blocks[{index}]")
        if isinstance(block, dict):
            block_id = block.get("id")
            if isinstance(block_id, str) and block_id.strip():
                if block_id in ids:
                    raise ValueError(f"blocks[{index}].id is duplicated")
                ids.append(block_id)
    _validate_expense_views(payload, len(blocks), set(ids))


def validate_section_data(section: str, data: object) -> None:
    """Optional structured payload. Only `prad` is checked; other sections keep any `data`."""

    if section != "prad" or data is None:
        return
    if not isinstance(data, dict):
        raise ValueError("data must be an object")
    _require_str(data, "currency", "data")
    if "invoices" not in data or data["invoices"] is None:
        return
    invoices = data["invoices"]
    if not isinstance(invoices, list):
        raise ValueError("data.invoices must be a list")
    if len(invoices) > MAX_ITEMS:
        raise ValueError(f"data.invoices exceeds {MAX_ITEMS}")
    for index, row in enumerate(invoices):
        _validate_energy_invoice(row, f"data.invoices[{index}]")


def validate_display(display: object) -> None:
    """Checks the optional envelope display hints. Only `hidden` is constrained."""

    if not isinstance(display, dict) or "hidden" not in display or display["hidden"] is None:
        return
    if not isinstance(display["hidden"], bool):
        raise ValueError("display.hidden must be a boolean")


def validate_section_extra(section: str, extra: dict[str, Any]) -> None:
    if section == "inbox_cleanup":
        for key in ("archived", "left"):
            if key in extra and extra[key] is not None and not is_number(extra[key]):
                raise ValueError(f"extra.{key} must be a number")
        return
    if section == "job_offers":
        _validate_job_offers_extra(extra)
        return
    if section == "expenses_weekly":
        _validate_expenses_extra(extra)
    elif section == "expenses_monthly":
        _validate_expenses_monthly_extra(extra)
    elif section == "finance":
        _validate_finance_extra(extra)
    elif section == "subscriptions":
        _validate_subscriptions_extra(extra)
    elif section == "prices":
        _validate_prices_extra(extra)
    elif section == "payslip":
        _validate_payslip_extra(extra)
