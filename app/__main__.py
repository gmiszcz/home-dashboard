"""`python -m app` czyta HOST i PORT z konfiguracji."""

import uvicorn

from app.config import get_settings
from app.logging_config import configure_logging, get_logger


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    get_logger("dashboard").info("bind http://%s:%s", settings.host, settings.port)
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
