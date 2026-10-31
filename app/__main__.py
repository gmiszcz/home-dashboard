"""`python -m app` reads HOST and PORT from the configuration."""

from __future__ import annotations

import logging

import uvicorn

from app.config import get_settings
from app.logging_config import configure_logging

logger = logging.getLogger(__name__)


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("host=<%s>, port=<%s> | binding server", settings.host, settings.port)
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        http="h11",
        log_level=settings.log_level.lower(),
        access_log=False,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
