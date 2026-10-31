"""Envelope storage and retention. Broadcasting stays in the API layer."""

from typing import Any

from app.config import Settings
from app.logging_config import get_logger
from app.repositories.updates import UpdateRepository
from app.schemas.update import UpdateIn

logger = get_logger("dashboard.service")


class UpdateService:
    def __init__(self, repository: UpdateRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings

    def store(self, message: UpdateIn) -> tuple[dict[str, Any], bool]:
        stored, created = self._repository.save(message.payload())
        if created:
            removed = self._repository.prune(self._settings.retention_days)
            logger.info(
                "stored update id=%s section=%s generated_at=%s pruned=%s",
                stored["id"],
                stored["section"],
                stored["generated_at"],
                removed,
            )
        else:
            logger.info(
                "duplicate update id=%s section=%s generated_at=%s",
                stored["id"],
                stored["section"],
                stored["generated_at"],
            )
        return stored, created

    def latest(self) -> list[dict[str, Any]]:
        return self._repository.latest()

    def history(self, section: str, limit: int) -> list[dict[str, Any]]:
        return self._repository.history(section, limit)

    def count(self) -> int:
        return self._repository.count()

    def ack(self, section: str, item_id: str) -> dict[str, str]:
        return self._repository.ack(section, item_id)

    def unack(self, section: str, item_id: str) -> bool:
        return self._repository.unack(section, item_id)

    def get_acks(self, section: str | None = None) -> list[dict[str, str]]:
        return self._repository.get_acks(section)
