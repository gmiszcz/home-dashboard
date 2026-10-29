"""SQLite, jedna tabela, tryb WAL, dopisywanie. Ryuk nie łączy się z bazą."""

import json
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app.logging_config import get_logger
from app.timeutil import WARSAW, now_warsaw, parse_instant, utc_now_iso

logger = get_logger("dashboard.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    schema_version INTEGER NOT NULL,
    title TEXT,
    summary TEXT,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_section_time ON updates(section, generated_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_updates_section_generated_at
    ON updates(section, generated_at);
"""


class UpdateRepository:
    """Krótka blokada wokół jednego połączenia. Zapis jest idempotentny."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.execute("PRAGMA foreign_keys=ON")

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def migrate(self) -> None:
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()
        mode = self.journal_mode()
        logger.info("sqlite ready path=%s journal_mode=%s", self.path, mode)

    def journal_mode(self) -> str:
        with self._lock:
            row = self._conn.execute("PRAGMA journal_mode").fetchone()
        return str(row[0])

    def save(self, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        """Wstawia wiersz albo zwraca istniejący dla pary section + generated_at."""

        section = payload["section"]
        generated_at = payload["generated_at"]
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        received_at = utc_now_iso()
        with self._lock:
            try:
                self._conn.execute("BEGIN IMMEDIATE")
                existing = self._conn.execute(
                    "SELECT * FROM updates WHERE section = ? AND generated_at = ?",
                    (section, generated_at),
                ).fetchone()
                if existing is not None:
                    self._conn.execute("COMMIT")
                    return _public_row(existing), False
                cursor = self._conn.execute(
                    """
                    INSERT INTO updates (
                        section, generated_at, received_at, schema_version, title, summary, payload
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        section,
                        generated_at,
                        received_at,
                        payload["schema_version"],
                        payload.get("title"),
                        payload.get("summary"),
                        body,
                    ),
                )
                self._conn.execute("COMMIT")
            except sqlite3.IntegrityError:
                self._conn.execute("ROLLBACK")
                existing = self._conn.execute(
                    "SELECT * FROM updates WHERE section = ? AND generated_at = ?",
                    (section, generated_at),
                ).fetchone()
                if existing is None:
                    raise
                return _public_row(existing), False
            except Exception:
                self._conn.execute("ROLLBACK")
                raise
            row = self._conn.execute(
                "SELECT * FROM updates WHERE id = ?",
                (cursor.lastrowid,),
            ).fetchone()
        assert row is not None
        return _public_row(row), True

    def latest(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM updates").fetchall()
        best: dict[str, sqlite3.Row] = {}
        for row in rows:
            current = best.get(row["section"])
            if current is None or _sort_key(row) > _sort_key(current):
                best[row["section"]] = row
        ordered = sorted(best.values(), key=lambda item: item["section"])
        return [_public_row(row) for row in ordered]

    def history(self, section: str, limit: int) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM updates WHERE section = ?",
                (section,),
            ).fetchall()
        ordered = sorted(rows, key=_sort_key, reverse=True)[:limit]
        return [_public_row(row) for row in ordered]

    def count(self) -> int:
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) AS n FROM updates").fetchone()
        return int(row["n"])

    def prune(self, retention_days: int | None) -> int:
        """Usuwa historię starszą niż próg. Najnowszy wiersz sekcji zostaje."""

        if not retention_days:
            return 0
        cutoff = now_warsaw() - timedelta(days=retention_days)
        with self._lock:
            rows = list(self._conn.execute("SELECT id, section, generated_at FROM updates"))
        newest: dict[str, tuple[datetime, int]] = {}
        parsed: list[tuple[sqlite3.Row, tuple[datetime, int]]] = []
        for row in rows:
            key = _sort_key(row)
            parsed.append((row, key))
            current = newest.get(row["section"])
            if current is None or key > current:
                newest[row["section"]] = key
        delete_ids = [
            row["id"]
            for row, key in parsed
            if newest[row["section"]][1] != row["id"] and key[0] < cutoff
        ]
        if not delete_ids:
            return 0
        with self._lock:
            self._conn.executemany(
                "DELETE FROM updates WHERE id = ?",
                [(item_id,) for item_id in delete_ids],
            )
            self._conn.commit()
        logger.info("retention removed %s rows older than %s days", len(delete_ids), retention_days)
        return len(delete_ids)


def _sort_key(row: sqlite3.Row) -> tuple[datetime, int]:
    try:
        instant = parse_instant(row["generated_at"])
    except ValueError:
        instant = datetime(1970, 1, 1, tzinfo=WARSAW)
    return (instant, int(row["id"]))


def _public_row(row: sqlite3.Row) -> dict[str, Any]:
    payload = json.loads(row["payload"])
    if not isinstance(payload, dict):
        payload = {}
    payload["id"] = int(row["id"])
    payload["received_at"] = row["received_at"]
    payload["section"] = row["section"]
    payload["generated_at"] = row["generated_at"]
    payload["schema_version"] = int(row["schema_version"])
    payload["title"] = row["title"]
    payload["summary"] = row["summary"]
    return payload
