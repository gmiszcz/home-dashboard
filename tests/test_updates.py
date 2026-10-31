"""Validation, appending, latest row, idempotency and retention."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.helpers import days_ago, envelope, warsaw


def test_validation_rejects_bad_payloads(client: TestClient, auth_header: dict[str, str]) -> None:
    naive = envelope(generated_at="2026-10-29T16:00:00")
    assert client.post("/api/update", json=naive, headers=auth_header).status_code == 422

    utc = envelope(generated_at="2026-10-29T15:00:00+00:00")
    assert client.post("/api/update", json=utc, headers=auth_header).status_code == 422

    bad_status = envelope()
    bad_status["items"][0]["status"] = "delivered"
    assert client.post("/api/update", json=bad_status, headers=auth_header).status_code == 422

    uppercase = envelope()
    uppercase["items"][0]["status"] = "Shipped"
    assert client.post("/api/update", json=uppercase, headers=auth_header).status_code == 422

    string_price = envelope(section="prices", items=[{"price": "19,99", "currency": "PLN"}])
    assert client.post("/api/update", json=string_price, headers=auth_header).status_code == 422

    missing_currency = envelope(section="finance", items=[{"name": "Czynsz", "amount": 1800}])
    response = client.post("/api/update", json=missing_currency, headers=auth_header)
    assert response.status_code == 422


def test_unknown_section_keeps_extra_fields(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = envelope(
        section="aquarium",
        title="Akwarium",
        summary="Temperatura w normie",
        items=[{"id": "tank", "title": "Zbiornik", "temperature_c": 25.4, "extra": {"ph": 7.1}}],
        extra={"room": "salon"},
    )
    payload["note"] = "wartość fikcyjna"
    created = client.post("/api/update", json=payload, headers=auth_header)
    assert created.status_code == 200

    latest = client.get("/api/latest").json()["sections"]
    assert len(latest) == 1
    row = latest[0]
    assert row["section"] == "aquarium"
    assert row["note"] == "wartość fikcyjna"
    assert row["extra"]["room"] == "salon"
    assert row["items"][0]["temperature_c"] == 25.4
    assert row["items"][0]["extra"]["ph"] == 7.1
    assert row["id"] == created.json()["id"]
    assert "received_at" in row


def test_append_latest_and_history(client: TestClient, auth_header: dict[str, str]) -> None:
    older = envelope(
        section="calendar",
        title="Kalendarz",
        summary="Dziś dwa spotkania",
        generated_at=warsaw(),
        items=[],
    )
    newer = envelope(
        section="calendar",
        title="Kalendarz",
        summary="Jutro dentysta",
        generated_at="2026-10-29T18:30:00+01:00",
        items=[],
    )
    parcels = envelope()
    assert client.post("/api/update", json=older, headers=auth_header).status_code == 200
    second = client.post("/api/update", json=newer, headers=auth_header)
    assert second.status_code == 200
    assert client.post("/api/update", json=parcels, headers=auth_header).status_code == 200

    latest = {row["section"]: row for row in client.get("/api/latest").json()["sections"]}
    assert set(latest) == {"calendar", "parcels"}
    assert latest["calendar"]["summary"] == "Jutro dentysta"
    assert latest["calendar"]["id"] == second.json()["id"]

    history = client.get("/api/section/calendar", params={"limit": 1}).json()
    assert history["section"] == "calendar"
    assert len(history["updates"]) == 1
    assert history["updates"][0]["summary"] == "Jutro dentysta"

    full = client.get("/api/section/calendar", params={"limit": 10}).json()["updates"]
    assert [row["summary"] for row in full] == ["Jutro dentysta", "Dziś dwa spotkania"]
    assert client.get("/api/section/missing").json()["updates"] == []


def test_duplicate_section_and_generated_at_returns_existing_id(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = envelope()
    first = client.post("/api/update", json=payload, headers=auth_header)
    second = client.post("/api/update", json=payload, headers=auth_header)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json() == {"id": first.json()["id"]}
    history = client.get("/api/section/parcels").json()["updates"]
    assert len(history) == 1
    health = client.get("/api/health").json()
    assert health["status"] == "ok"
    assert health["db"] == "ok"
    assert health["updates"] == 1
    assert health["stale_after_minutes"] == 360


def test_batch_endpoint(client: TestClient, auth_header: dict[str, str]) -> None:
    body = {
        "schema_version": 1,
        "sent_at": warsaw(),
        "messages": [
            envelope(
                section="prices", items=[{"product": "Kawa", "price": 39.9, "currency": "PLN"}]
            ),
            envelope(
                section="promotions", items=[{"product": "Herbata", "price": 12, "currency": "PLN"}]
            ),
        ],
    }
    response = client.post("/api/updates", json=body, headers=auth_header)
    assert response.status_code == 200
    assert response.json()["ids"] == [1, 2]
    sections = {row["section"] for row in client.get("/api/latest").json()["sections"]}
    assert sections == {"prices", "promotions"}

    again = client.post("/api/updates", json=body, headers=auth_header)
    assert again.status_code == 200
    assert again.json()["ids"] == [1, 2]
    assert client.get("/api/health").json()["updates"] == 2


def test_invalid_batch_does_not_write(client: TestClient, auth_header: dict[str, str]) -> None:
    body = {
        "schema_version": 1,
        "sent_at": warsaw(),
        "messages": [
            envelope(),
            {"schema_version": 1, "section": "calendar"},
        ],
    }
    response = client.post("/api/updates", json=body, headers=auth_header)
    assert response.status_code == 422
    assert client.get("/api/health").json()["updates"] == 0


def test_empty_items_are_allowed(client: TestClient, auth_header: dict[str, str]) -> None:
    payload = envelope(section="ai_daily", title="AI", summary="Cisza", items=[])
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200


def test_retention_keeps_newest_row(retention_client: TestClient) -> None:
    header = {"Authorization": "Bearer test-token-value"}
    old = envelope(
        section="finance",
        generated_at=days_ago(30),
        items=[{"name": "Stare", "amount": 1, "currency": "PLN"}],
    )
    fresh = envelope(
        section="finance",
        generated_at=days_ago(0),
        summary="bieżące",
        items=[{"name": "Czynsz", "amount": 1800, "currency": "PLN"}],
    )
    assert retention_client.post("/api/update", json=old, headers=header).status_code == 200
    assert retention_client.post("/api/update", json=fresh, headers=header).status_code == 200
    history = retention_client.get("/api/section/finance").json()["updates"]
    assert len(history) == 1
    assert history[0]["summary"] == "bieżące"


def test_latest_and_history_order_by_instant_across_dst(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    # 02:15+01:00 is a later instant than 02:30+02:00 although its string sorts lower.
    later = envelope(
        section="calendar",
        generated_at="2026-10-25T02:15:00+01:00",
        summary="po zmianie czasu",
        items=[],
    )
    earlier = envelope(
        section="calendar",
        generated_at="2026-10-25T02:30:00+02:00",
        summary="przed zmianą czasu",
        items=[],
    )
    assert client.post("/api/update", json=later, headers=auth_header).status_code == 200
    assert client.post("/api/update", json=earlier, headers=auth_header).status_code == 200

    latest = client.get("/api/latest").json()["sections"]
    assert [row["summary"] for row in latest] == ["po zmianie czasu"]
    history = client.get("/api/section/calendar").json()["updates"]
    assert [row["summary"] for row in history] == ["po zmianie czasu", "przed zmianą czasu"]


def test_retention_keeps_newest_row_per_section(retention_client: TestClient) -> None:
    header = {"Authorization": "Bearer test-token-value"}
    money = [{"name": "Czynsz", "amount": 1800, "currency": "PLN"}]
    rows = [
        envelope(section="finance", generated_at=days_ago(30), summary="finance old", items=money),
        envelope(section="finance", generated_at=days_ago(0), summary="finance fresh", items=money),
        envelope(section="parcels", generated_at=days_ago(30), summary="parcels old"),
        envelope(section="parcels", generated_at=days_ago(0), summary="parcels fresh"),
        envelope(section="ai_daily", generated_at=days_ago(30), summary="ai old", items=[]),
    ]
    for row in rows:
        assert retention_client.post("/api/update", json=row, headers=header).status_code == 200

    def summaries(section: str) -> list[str]:
        updates = retention_client.get(f"/api/section/{section}").json()["updates"]
        return [row["summary"] for row in updates]

    assert summaries("finance") == ["finance fresh"]
    assert summaries("parcels") == ["parcels fresh"]
    assert summaries("ai_daily") == ["ai old"]


def test_sqlite_uses_wal(client: TestClient, tmp_path) -> None:
    import sqlite3

    client.get("/api/health")
    connection = sqlite3.connect(tmp_path / "dashboard.sqlite")
    mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
    columns = [row[1] for row in connection.execute("PRAGMA table_info(updates)")]
    indexes = {row[1] for row in connection.execute("PRAGMA index_list('updates')")}
    connection.close()
    assert mode.lower() == "wal"
    assert columns == [
        "id",
        "section",
        "generated_at",
        "received_at",
        "schema_version",
        "title",
        "summary",
        "payload",
    ]
    assert "idx_section_time" in indexes
    assert "ux_updates_section_generated_at" in indexes


def test_schema_version_2_with_display(client: TestClient, auth_header: dict[str, str]) -> None:
    payload = {
        "schema_version": 2,
        "section": "ai_daily",
        "generated_at": warsaw(),
        "source": "ryuk",
        "title": "AI dziś",
        "summary": "OpenAI wypuściło nowy model rozumujący",
        "display": {
            "collapsed": False,
            "max_visible": 1,
            "sort": "priority",
        },
        "items": [
            {
                "id": "ai-2026-10-29-1",
                "priority": "high",
                "pinned": True,
                "title": "OpenAI wypuściło nowy model rozumujący",
                "text": "Krótki opis w 1–2 zdaniach.",
                "url": "https://example.com/artykul",
            },
            {
                "id": "ai-2026-10-29-2",
                "priority": "normal",
                "title": "Google aktualizuje Gemini",
                "text": "Krótki opis.",
                "url": "https://example.com/gemini",
            },
        ],
        "extra": {},
    }
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200

    latest = client.get("/api/latest").json()["sections"]
    row = next(s for s in latest if s["section"] == "ai_daily")
    assert row["schema_version"] == 2
    assert row["display"]["max_visible"] == 1
    assert len(row["items"]) == 2
