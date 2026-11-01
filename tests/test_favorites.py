"""Tests for favorites / saved articles endpoints and repository."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_post_favorite_and_get_favorites(client: TestClient) -> None:
    # Initially empty
    res = client.get("/api/favorites")
    assert res.status_code == 200
    assert res.json() == {"favorites": []}

    # Post a favorite
    article = {
        "title": "Nowy model AI",
        "url": "https://example.com/ai",
        "why_it_matters": "Przełom w rozumowaniu",
    }
    post_res = client.post(
        "/api/favorites",
        json={"section": "ai_weekly", "item_id": "ai-1", "item_data": article},
    )
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["status"] == "ok"
    assert data["favorite"]["section"] == "ai_weekly"
    assert data["favorite"]["item_id"] == "ai-1"
    assert data["favorite"]["item_data"]["title"] == "Nowy model AI"
    assert "saved_at" in data["favorite"]

    # Post a second favorite in a different section
    client.post(
        "/api/favorites",
        json={"section": "ai_daily", "item_id": "ai-daily-1", "item_data": {"title": "Daily AI"}},
    )

    # List all
    all_favs = client.get("/api/favorites").json()["favorites"]
    assert len(all_favs) == 2
    item_ids = {f["item_id"] for f in all_favs}
    assert item_ids == {"ai-1", "ai-daily-1"}

    # Filter by section
    weekly_favs = client.get("/api/favorites?section=ai_weekly").json()["favorites"]
    assert len(weekly_favs) == 1
    assert weekly_favs[0]["item_id"] == "ai-1"
    assert weekly_favs[0]["item_data"]["title"] == "Nowy model AI"


def test_favorite_idempotent_and_delete(client: TestClient) -> None:
    article = {"title": "Artykuł testowy"}
    client.post(
        "/api/favorites",
        json={"section": "ai_weekly", "item_id": "fav-1", "item_data": article},
    )
    # Post again (updates)
    article_updated = {"title": "Artykuł zaktualizowany"}
    client.post(
        "/api/favorites",
        json={"section": "ai_weekly", "item_id": "fav-1", "item_data": article_updated},
    )
    favs = client.get("/api/favorites?section=ai_weekly").json()["favorites"]
    assert len(favs) == 1
    assert favs[0]["item_data"]["title"] == "Artykuł zaktualizowany"

    # Delete favorite
    del_res = client.delete("/api/favorites?section=ai_weekly&item_id=fav-1")
    assert del_res.status_code == 200
    assert del_res.json()["removed"] is True

    # Empty now
    favs_after = client.get("/api/favorites?section=ai_weekly").json()["favorites"]
    assert len(favs_after) == 0

    # Idempotent delete
    del_res2 = client.delete("/api/favorites?section=ai_weekly&item_id=fav-1")
    assert del_res2.status_code == 200
    assert del_res2.json()["removed"] is False
