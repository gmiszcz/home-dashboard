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
from datetime import UTC, datetime, timedelta
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
    return {
        "schema_version": 1,
        "section": pool["section"],
        "generated_at": now.isoformat(timespec="seconds"),
        "source": pool.get("source", "ryuk-random"),
        "title": pool.get("title"),
        "summary": summary,
        "items": items,
        "extra": extra,
    }


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
