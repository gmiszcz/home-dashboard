"""Envelope storage and retention. Broadcasting stays in the API layer."""

from __future__ import annotations

import logging
from typing import Any

from app.config import Settings
from app.offers import present_update
from app.repositories.updates import DEFAULT_ACK_KIND, UpdateRepository
from app.schemas.update import UpdateIn

logger = logging.getLogger(__name__)


class UpdateService:
    def __init__(self, repository: UpdateRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings

    def store(self, message: UpdateIn) -> tuple[dict[str, Any], bool]:
        stored, created = self._repository.save(message.payload())
        if created:
            removed = self._repository.prune(self._settings.retention_days)
            logger.info(
                "id=<%s>, section=<%s>, generated_at=<%s>, pruned=<%s> | stored update",
                stored["id"],
                stored["section"],
                stored["generated_at"],
                removed,
            )
        else:
            logger.info(
                "id=<%s>, section=<%s>, generated_at=<%s> | duplicate update",
                stored["id"],
                stored["section"],
                stored["generated_at"],
            )
        return self._present(stored), created

    def latest(self) -> list[dict[str, Any]]:
        exclusions = self._repository.get_exclusions()
        return [present_update(row, exclusions) for row in self._repository.latest()]

    def history(self, section: str, limit: int) -> list[dict[str, Any]]:
        exclusions = self._repository.get_exclusions(section)
        return [present_update(row, exclusions) for row in self._repository.history(section, limit)]

    def _present(self, row: dict[str, Any]) -> dict[str, Any]:
        section = row.get("section")
        exclusions = self._repository.get_exclusions(section if isinstance(section, str) else None)
        return present_update(row, exclusions)

    def count(self) -> int:
        return self._repository.count()

    def ack(self, section: str, item_id: str, kind: str = DEFAULT_ACK_KIND) -> dict[str, str]:
        return self._repository.ack(section, item_id, kind)

    def unack(self, section: str, item_id: str) -> bool:
        return self._repository.unack(section, item_id)

    def get_acks(self, section: str | None = None) -> list[dict[str, str]]:
        return self._repository.get_acks(section)

    def save_favorite(
        self, section: str, item_id: str, item_data: dict[str, Any]
    ) -> dict[str, Any]:
        return self._repository.save_favorite(section, item_id, item_data)

    def remove_favorite(self, section: str, item_id: str) -> bool:
        return self._repository.remove_favorite(section, item_id)

    def get_favorites(self, section: str | None = None) -> list[dict[str, Any]]:
        return self._repository.get_favorites(section)

    def exclude(
        self, section: str, offer_id: str, url: str | None, title: str | None
    ) -> dict[str, Any]:
        return self._repository.exclude(section, offer_id, url, title)

    def restore_exclusion(self, section: str, offer_id: str) -> bool:
        return self._repository.restore_exclusion(section, offer_id)

    def get_exclusions(self, section: str | None = None) -> list[dict[str, Any]]:
        return self._repository.get_exclusions(section)
