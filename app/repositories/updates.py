"""SQLite, one append-only table in WAL mode. Ryuk never connects to the database."""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from datetime import timedelta
from pathlib import Path
from typing import Any

from app.timeutil import now_warsaw, utc_now_iso

logger = logging.getLogger(__name__)

# An item carries one mark per section, e.g. "ack" (read) or "skipped" (not interested).
DEFAULT_ACK_KIND = "ack"

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

CREATE TABLE IF NOT EXISTS acks (
    section TEXT NOT NULL,
    item_id TEXT NOT NULL,
    acked_at TEXT NOT NULL DEFAULT (datetime('now')),
    kind TEXT NOT NULL DEFAULT 'ack',
    PRIMARY KEY (section, item_id)
);
CREATE INDEX IF NOT EXISTS idx_acks_section ON acks(section);

CREATE TABLE IF NOT EXISTS favorites (
    section TEXT NOT NULL,
    item_id TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT (datetime('now')),
    item_data TEXT NOT NULL,
    PRIMARY KEY (section, item_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_section ON favorites(section);
"""

# Newest row per section, by instant. julianday() applies the stored +01:00/+02:00 offset.
LATEST_IDS_SQL = """
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY section ORDER BY julianday(generated_at) DESC, id DESC
        ) AS position
        FROM updates
    )
    WHERE position = 1
"""
LATEST_ROWS_SQL = f"SELECT * FROM updates WHERE id IN ({LATEST_IDS_SQL}) ORDER BY section"  # nosec B608
PRUNE_SQL = f"DELETE FROM updates WHERE julianday(generated_at) < julianday(?) AND id NOT IN ({LATEST_IDS_SQL})"  # nosec B608


SELECT_BY_KEY_SQL = "SELECT * FROM updates WHERE section = ? AND generated_at = ?"


class UpdateRepository:
    """A short lock around a single connection. Writes are idempotent."""

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
            # Databases created before marks had a kind get the column with the default.
            columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(acks)")}
            if "kind" not in columns:
                self._conn.execute("ALTER TABLE acks ADD COLUMN kind TEXT NOT NULL DEFAULT 'ack'")
            self._conn.commit()
        mode = self.journal_mode()
        logger.info("path=<%s>, journal_mode=<%s> | sqlite ready", self.path, mode)

    def journal_mode(self) -> str:
        with self._lock:
            row = self._conn.execute("PRAGMA journal_mode").fetchone()
        return str(row[0])

    def save(self, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        """Inserts a row, or returns the existing one for the same section + generated_at pair."""

        section = payload["section"]
        generated_at = payload["generated_at"]
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        received_at = utc_now_iso()
        with self._lock:
            try:
                self._conn.execute("BEGIN IMMEDIATE")
                existing = self._conn.execute(
                    SELECT_BY_KEY_SQL,
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
                    SELECT_BY_KEY_SQL,
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
        if row is None:
            raise RuntimeError("inserted row not found")
        return _public_row(row), True

    def latest(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(LATEST_ROWS_SQL).fetchall()
        return [_public_row(row) for row in rows]

    def history(self, section: str, limit: int) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM updates WHERE section = ? "
                "ORDER BY julianday(generated_at) DESC, id DESC LIMIT ?",
                (section, limit),
            ).fetchall()
        return [_public_row(row) for row in rows]

    def count(self) -> int:
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) AS n FROM updates").fetchone()
        return int(row["n"])

    def ack(self, section: str, item_id: str, kind: str = DEFAULT_ACK_KIND) -> dict[str, str]:
        now = utc_now_iso()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO acks (section, item_id, acked_at, kind)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(section, item_id) DO UPDATE SET
                    acked_at = excluded.acked_at, kind = excluded.kind
                """,
                (section, item_id, now, kind),
            )
            self._conn.commit()
        return {"section": section, "item_id": item_id, "acked_at": now, "kind": kind}

    def unack(self, section: str, item_id: str) -> bool:
        """Removes the mark of an item. Returns whether a mark existed."""

        with self._lock:
            cursor = self._conn.execute(
                "DELETE FROM acks WHERE section = ? AND item_id = ?", (section, item_id)
            )
            self._conn.commit()
        return cursor.rowcount > 0

    def get_acks(self, section: str | None = None) -> list[dict[str, str]]:
        with self._lock:
            if section:
                rows = self._conn.execute(
                    "SELECT section, item_id, acked_at, kind FROM acks WHERE section = ? ORDER BY acked_at DESC",
                    (section,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT section, item_id, acked_at, kind FROM acks ORDER BY acked_at DESC"
                ).fetchall()
        return [
            {
                "section": str(r["section"]),
                "item_id": str(r["item_id"]),
                "acked_at": str(r["acked_at"]),
                "kind": str(r["kind"]),
            }
            for r in rows
        ]

    def save_favorite(
        self, section: str, item_id: str, item_data: dict[str, Any]
    ) -> dict[str, Any]:
        now = utc_now_iso()
        item_json = json.dumps(item_data, ensure_ascii=False, separators=(",", ":"))
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO favorites (section, item_id, saved_at, item_data)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(section, item_id) DO UPDATE SET
                    saved_at = excluded.saved_at, item_data = excluded.item_data
                """,
                (section, item_id, now, item_json),
            )
            self._conn.commit()
        return {"section": section, "item_id": item_id, "saved_at": now, "item_data": item_data}

    def remove_favorite(self, section: str, item_id: str) -> bool:
        with self._lock:
            cursor = self._conn.execute(
                "DELETE FROM favorites WHERE section = ? AND item_id = ?", (section, item_id)
            )
            self._conn.commit()
            return cursor.rowcount > 0

    def get_favorites(self, section: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            if section:
                rows = self._conn.execute(
                    """
                    SELECT section, item_id, saved_at, item_data
                    FROM favorites WHERE section = ? ORDER BY saved_at DESC
                    """,
                    (section,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT section, item_id, saved_at, item_data
                    FROM favorites ORDER BY saved_at DESC
                    """
                ).fetchall()
        result: list[dict[str, Any]] = []
        for r in rows:
            try:
                data = json.loads(str(r["item_data"]))
            except Exception:
                data = {}
            result.append(
                {
                    "section": str(r["section"]),
                    "item_id": str(r["item_id"]),
                    "saved_at": str(r["saved_at"]),
                    "item_data": data,
                }
            )
        return result

    def prune(self, retention_days: int | None) -> int:
        """Deletes history older than the threshold. The newest row of each section is kept."""

        if not retention_days:
            return 0
        cutoff = (now_warsaw() - timedelta(days=retention_days)).isoformat(timespec="seconds")
        with self._lock:
            cursor = self._conn.execute(PRUNE_SQL, (cutoff,))
            self._conn.commit()
        removed = cursor.rowcount
        if removed:
            logger.info(
                "removed=<%s>, retention_days=<%s> | retention pruned old rows",
                removed,
                retention_days,
            )
        return removed


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
