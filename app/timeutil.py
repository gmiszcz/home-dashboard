"""ISO 8601 timestamps with the Europe/Warsaw offset."""

from datetime import datetime
from zoneinfo import ZoneInfo

WARSAW = ZoneInfo("Europe/Warsaw")
UTC = ZoneInfo("UTC")


def ensure_warsaw(value: datetime) -> datetime:
    """Requires an aware datetime whose offset matches Europe/Warsaw at that instant."""

    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamp must include the Europe/Warsaw offset")
    expected = value.astimezone(WARSAW).utcoffset()
    if value.utcoffset() != expected:
        raise ValueError("timestamp offset must match Europe/Warsaw")
    return value.astimezone(WARSAW)


def canonical_iso(value: datetime) -> str:
    local = ensure_warsaw(value).replace(microsecond=0)
    return local.isoformat(timespec="seconds")


def parse_instant(value: str) -> datetime:
    return ensure_warsaw(datetime.fromisoformat(value))


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def coerce_timestamp_string(value: object) -> str:
    """Accepts a YYYY-MM-DD date or a datetime with the Warsaw offset."""

    if not isinstance(value, str):
        raise ValueError("timestamp must be a string")
    text = value.strip()
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        try:
            datetime.strptime(text, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("invalid date") from exc
        return text
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError("invalid timestamp") from exc
    return canonical_iso(parsed)


def now_warsaw() -> datetime:
    return datetime.now(WARSAW).replace(microsecond=0)


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat(timespec="seconds")
