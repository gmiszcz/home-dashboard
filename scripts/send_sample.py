#!/usr/bin/env python3
"""Sends the files from samples/ to the dashboard.

Take the token from the DASHBOARD_TOKEN variable. The --token argument leaves the
secret in the process list, so it is only meant for a one-off test.

--random draws envelopes from the samples/pool/ pool, so every run gives a different screen.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import urllib.error
import urllib.request
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "samples"
POOL = SAMPLES / "pool"
WARSAW = ZoneInfo("Europe/Warsaw")

# Pool placeholders, resolved relative to "now":
#   @t:A..Bh / @t:Am      timestamp now + random offset (units m, h, d), Warsaw offset
#   @d:A..B               date YYYY-MM-DD, now + random days
#   @after:FIELD:A..Bm    timestamp after the item's already resolved FIELD
#   @int:A..B / @num:A..B random integer / float with 2 decimals
#   @pick:a|b|c           random choice
#   @code:N               random string of N digits
#   @sum                  (extra only) sum of item "amount" values
#   @week                 current ISO week, e.g. 2026-W44
RANGE = re.compile(r"^(-?\d+)(?:\.\.(-?\d+))?([mhd]?)$")
UNIT_SECONDS = {"m": 60, "h": 3600, "d": 86400, "": 86400}


def parse_timestamp(value: str) -> datetime | None:
    if len(value) == 10 and value[4] == "-" and value[7] == "-":
        try:
            return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=WARSAW)
        except ValueError:
            return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed


def shift_value(value: object, delta: timedelta) -> object:
    if isinstance(value, dict):
        return {key: shift_value(item, delta) for key, item in value.items()}
    if isinstance(value, list):
        return [shift_value(item, delta) for item in value]
    if not isinstance(value, str):
        return value
    parsed = parse_timestamp(value)
    if parsed is None:
        return value
    moved = parsed + delta
    if len(value) == 10 and value[4] == "-" and value[7] == "-":
        return moved.astimezone(WARSAW).date().isoformat()
    return moved.astimezone(WARSAW).replace(microsecond=0).isoformat(timespec="seconds")


def freshen(payload: dict) -> dict:
    generated = payload.get("generated_at")
    if not isinstance(generated, str):
        return payload
    parsed = parse_timestamp(generated)
    if parsed is None:
        return payload
    now = datetime.now(WARSAW).replace(microsecond=0)
    return cast(dict, shift_value(payload, now - parsed))


def load_samples(only: str | None, fresh: bool) -> list[dict]:
    paths = sorted(SAMPLES.glob("*.json"))
    if only:
        paths = [path for path in paths if path.stem == only]
        if not paths:
            raise SystemExit(f"No such file: samples/{only}.json")
    messages = []
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        messages.append(freshen(payload) if fresh else payload)
    if not messages:
        raise SystemExit(f"No JSON files in {SAMPLES}")
    return messages


def _parse_range(spec: str, rng: random.Random) -> tuple[int, str]:
    """Parses `A..B<unit>` and returns a random value from the range plus its unit."""

    match = RANGE.match(spec)
    if match is None:
        raise ValueError(f"invalid range: {spec!r}")
    low = int(match.group(1))
    high = int(match.group(2)) if match.group(2) is not None else low
    return rng.randint(min(low, high), max(low, high)), match.group(3)


def _timestamp(base: datetime, spec: str, rng: random.Random) -> str:
    """Moves base by a random offset. Arithmetic in UTC keeps the Warsaw offset valid across DST."""

    value, unit = _parse_range(spec, rng)
    moved = (base.astimezone(UTC) + timedelta(seconds=value * UNIT_SECONDS[unit])).astimezone(
        WARSAW
    )
    if unit in {"h", "d"}:
        moved = moved.replace(minute=moved.minute // 15 * 15)
        if moved.hour < 7:
            # Keep coarse random times out of the night, e.g. 02:30 becomes 10:30.
            moved = moved.replace(hour=moved.hour + 8)
    return moved.replace(second=0, microsecond=0).isoformat(timespec="seconds")


def _resolve(value: Any, now: datetime, rng: random.Random) -> Any:
    """Resolves placeholders recursively. `@after:` and `@sum` are left for later passes."""

    if isinstance(value, dict):
        return {key: _resolve(item, now, rng) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve(item, now, rng) for item in value]
    if not isinstance(value, str) or not value.startswith("@"):
        return value
    kind, _, spec = value[1:].partition(":")
    if kind == "t":
        return _timestamp(now, spec, rng)
    if kind == "d":
        days, _ = _parse_range(spec, rng)
        return (now + timedelta(days=days)).date().isoformat()
    if kind == "int":
        return _parse_range(spec, rng)[0]
    if kind == "num":
        low, _, high = spec.partition("..")
        return round(rng.uniform(float(low), float(high or low)), 2)
    if kind == "pick":
        return rng.choice(spec.split("|"))
    if kind == "code":
        return "".join(rng.choice("0123456789") for _ in range(int(spec)))
    if kind == "week":
        year, week, _ = now.isocalendar()
        return f"{year}-W{week:02d}"
    if kind in {"after", "sum"}:
        return value
    raise ValueError(f"unknown placeholder: {value!r}")


def _resolve_after(item: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    """Resolves `@after:FIELD:A..Bm` against a field of the same item."""

    resolved = dict(item)
    for key, value in item.items():
        if not (isinstance(value, str) and value.startswith("@after:")):
            continue
        _, field, spec = value.split(":", 2)
        anchor = resolved.get(field)
        if not isinstance(anchor, str):
            raise ValueError(f"@after references missing field {field!r}")
        resolved[key] = _timestamp(datetime.fromisoformat(anchor), spec, rng)
    return resolved


DAY_LABELS = ("Dziś", "Jutro", "Pojutrze")
WEEK_DAYS = 7


def calendar_layout(events: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    """Splits events into days (Dziś, Jutro, Pojutrze) and the following 7 days by Warsaw date.

    Events outside that range are dropped, because the dashboard rejects them.
    """

    today = now.astimezone(WARSAW).date()
    day_keys = [(today + timedelta(days=offset)).isoformat() for offset in range(len(DAY_LABELS))]
    week_from = today + timedelta(days=len(DAY_LABELS))
    week_to = week_from + timedelta(days=WEEK_DAYS - 1)
    days: dict[str, list[dict[str, Any]]] = {key: [] for key in day_keys}
    week: list[dict[str, Any]] = []
    for event in events:
        start = str(event["start"])
        key = (
            start
            if len(start) == 10
            else datetime.fromisoformat(start).astimezone(WARSAW).date().isoformat()
        )
        if key in days:
            days[key].append(event)
        elif week_from.isoformat() <= key <= week_to.isoformat():
            week.append(event)
    return {
        "layout": "days_plus_week",
        "days": [
            {"date": key, "label": label, "events": days[key]}
            for key, label in zip(day_keys, DAY_LABELS, strict=True)
        ],
        "week": {"from": week_from.isoformat(), "to": week_to.isoformat(), "events": week},
        "items": [],
    }


EXPENSE_DAY_LABELS = ("Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd")


def _expense_breakdown(items: list[dict[str, Any]], monday: date) -> dict[str, Any]:
    """Builds total, by_category (largest first) and by_day (Pn..Nd) from dated items."""

    by_category: dict[str, float] = {}
    by_day = {(monday + timedelta(days=offset)).isoformat(): 0.0 for offset in range(WEEK_DAYS)}
    for item in items:
        amount = float(item["amount"])
        by_category[item["category"]] = by_category.get(item["category"], 0.0) + amount
        by_day[item["date"]] += amount
    return {
        "total": round(sum(item["amount"] for item in items), 2),
        "by_category": [
            {"category": category, "amount": round(amount, 2)}
            for category, amount in sorted(by_category.items(), key=lambda row: -row[1])
        ],
        "by_day": [
            {"date": day, "label": label, "amount": round(amount, 2)}
            for (day, amount), label in zip(by_day.items(), EXPENSE_DAY_LABELS, strict=True)
        ],
    }


def expenses_week(items: list[dict[str, Any]], now: datetime, rng: random.Random) -> dict[str, Any]:
    """Dates the items inside the current Warsaw week and returns the matching chart `extra`.

    Mutates item dates. The previous week is synthesized from the same items with random
    amounts, so the chart, the list and the week switch all have data.
    """

    today = now.astimezone(WARSAW).date()
    monday = today - timedelta(days=today.weekday())
    for item in items:
        item["date"] = (monday + timedelta(days=rng.randint(0, today.weekday()))).isoformat()
    previous_monday = monday - timedelta(days=WEEK_DAYS)
    previous_items = [
        {
            **item,
            "id": f"prev-{item['id']}",
            "amount": round(item["amount"] * rng.uniform(0.6, 1.4), 2),
            "date": (previous_monday + timedelta(days=rng.randint(0, WEEK_DAYS - 1))).isoformat(),
        }
        for item in items
    ]
    current = _expense_breakdown(items, monday)
    previous = _expense_breakdown(previous_items, previous_monday)
    return {
        **current,
        "week_from": monday.isoformat(),
        "week_to": (monday + timedelta(days=WEEK_DAYS - 1)).isoformat(),
        "data_until": today.isoformat(),
        "diff_vs_previous": round(current["total"] - previous["total"], 2),
        "previous_week": {
            **previous,
            "week": "{}-W{:02d}".format(*previous_monday.isocalendar()[:2]),
            "week_from": previous_monday.isoformat(),
            "week_to": (previous_monday + timedelta(days=WEEK_DAYS - 1)).isoformat(),
            "items": previous_items,
        },
    }


def random_message(pool: dict[str, Any], now: datetime, rng: random.Random) -> dict[str, Any]:
    """Builds one envelope from a pool file: random subset of items, summary and extra values."""

    low, high = pool.get("count", [1, len(pool["items"])])
    is_empty = rng.random() < pool.get("empty_chance", 0.0)
    count = 0 if is_empty else rng.randint(low, min(high, len(pool["items"])))
    items = [
        _resolve_after(_resolve(item, now, rng), rng) for item in rng.sample(pool["items"], count)
    ]
    extra = _resolve(pool.get("extra", {}), now, rng)
    for key, value in extra.items():
        if value == "@sum":
            extra[key] = round(sum(item.get("amount", 0) for item in items), 2)
    if is_empty:
        summary = pool.get("empty_summary", "Nic nowego")
    else:
        summary = rng.choice(pool["summaries"]).format(n=count)
    message = {
        "schema_version": 1,
        "section": pool["section"],
        "generated_at": now.isoformat(timespec="seconds"),
        "source": pool.get("source", "ryuk-random"),
        "title": pool.get("title"),
        "summary": summary,
        "items": items,
        "extra": extra,
    }
    if pool.get("layout") == "days_plus_week":
        message.update(calendar_layout(items, now))
    if pool.get("layout") == "expenses_week":
        extra.update(expenses_week(items, now, rng))
    return message


def load_random(only: str | None, seed: int | None) -> list[dict[str, Any]]:
    """Generates one random envelope per pool file in samples/pool/."""

    paths = sorted(POOL.glob("*.json"))
    if only:
        paths = [path for path in paths if path.stem == only]
        if not paths:
            raise SystemExit(f"No such file: samples/pool/{only}.json")
    if not paths:
        raise SystemExit(f"No JSON files in {POOL}")
    # Sample data only, not security relevant.
    rng = random.Random(seed)  # nosec B311
    now = datetime.now(WARSAW).replace(microsecond=0)
    return [
        random_message(json.loads(path.read_text(encoding="utf-8")), now, rng) for path in paths
    ]


def post_json(url: str, token: str, payload: dict) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        # The developer supplies the --url, so any scheme is their choice.
        with urllib.request.urlopen(request, timeout=20) as response:  # nosec B310
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"{exc.code} {url}: {detail}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Send sample summaries to the dashboard.")
    parser.add_argument("--url", default=os.environ.get("DASHBOARD_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--token", default=os.environ.get("DASHBOARD_TOKEN"))
    parser.add_argument("--only", help="Section name, e.g. parcels")
    parser.add_argument(
        "--batch", action="store_true", help="One POST /api/updates instead of a series"
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Shift timestamps so that generated_at is now (Warsaw)",
    )
    parser.add_argument(
        "--random",
        action="store_true",
        help="Draw envelopes from samples/pool/ (different items on every run)",
    )
    parser.add_argument("--seed", type=int, help="Random seed, to reproduce the same screen")
    args = parser.parse_args()
    if not args.token:
        raise SystemExit("Set DASHBOARD_TOKEN or pass --token")
    if args.random:
        messages = load_random(args.only, args.seed)
    else:
        messages = load_samples(args.only, args.fresh)
    base = args.url.rstrip("/")
    if args.batch:
        sent_at = datetime.now(WARSAW).replace(microsecond=0).isoformat(timespec="seconds")
        result = post_json(
            f"{base}/api/updates",
            args.token,
            {"schema_version": 1, "sent_at": sent_at, "messages": messages},
        )
        print(json.dumps(result, ensure_ascii=False))
        return
    for message in messages:
        result = post_json(f"{base}/api/update", args.token, message)
        print(f"{message['section']}: {json.dumps(result, ensure_ascii=False)}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
