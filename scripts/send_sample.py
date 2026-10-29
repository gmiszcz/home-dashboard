#!/usr/bin/env python3
"""Wysyła pliki z samples/ na pulpit.

Token bierz ze zmiennej DASHBOARD_TOKEN. Argument --token zostawia sekret
w liście procesów, więc jest tylko na wypadek jednorazowego testu.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "samples"
WARSAW = ZoneInfo("Europe/Warsaw")


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
    return shift_value(payload, now - parsed)


def load_samples(only: str | None, fresh: bool) -> list[dict]:
    paths = sorted(SAMPLES.glob("*.json"))
    if only:
        paths = [path for path in paths if path.stem == only]
        if not paths:
            raise SystemExit(f"Nie ma pliku samples/{only}.json")
    messages = []
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        messages.append(freshen(payload) if fresh else payload)
    if not messages:
        raise SystemExit(f"Brak plików JSON w {SAMPLES}")
    return messages


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
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"{exc.code} {url}: {detail}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Wyślij przykładowe podsumowania na pulpit.")
    parser.add_argument("--url", default=os.environ.get("DASHBOARD_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--token", default=os.environ.get("DASHBOARD_TOKEN"))
    parser.add_argument("--only", help="Nazwa sekcji, np. parcels")
    parser.add_argument("--batch", action="store_true", help="Jeden POST /api/updates zamiast serii")
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Przesuń znaczniki czasu tak, żeby generated_at było teraz (Warszawa)",
    )
    args = parser.parse_args()
    if not args.token:
        raise SystemExit("Ustaw DASHBOARD_TOKEN albo przekaż --token")
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
