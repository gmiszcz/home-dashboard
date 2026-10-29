"""Reguły pól pozycji dla znanych sekcji. Nieznana sekcja przechodzi bez zmian."""

from app.timeutil import coerce_timestamp_string, is_number

PARCEL_STATUSES = frozenset(
    {"shipped", "in_transit", "ready_for_pickup", "picked_up", "returned"}
)
EMAIL_GROUPS = frozenset(
    {"subscriptions_finance", "purchases", "parcels", "direct", "ai_newsletters"}
)
PRICE_AVAILABILITY = frozenset({"online_delivery", "in_store"})
GITHUB_TYPES = frozenset({"feature", "release", "fix"})

MONEY_SECTIONS = frozenset(
    {"prices", "promotions", "subscriptions", "expenses_weekly", "finance"}
)

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
                    if key in pickup and pickup[key] is not None and not isinstance(pickup[key], str):
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


def validate_section_extra(section: str, extra: dict) -> None:
    if section != "inbox_cleanup":
        return
    for key in ("archived", "left"):
        if key in extra and extra[key] is not None and not is_number(extra[key]):
            raise ValueError(f"extra.{key} must be a number")
