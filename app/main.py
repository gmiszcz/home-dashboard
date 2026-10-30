"""FastAPI application. Serves the API, the WebSocket and the built frontend."""

import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.router import api_router
from app.config import get_settings
from app.logging_config import configure_logging, get_logger
from app.middleware import AccessLogMiddleware, BodyLimitMiddleware
from app.repositories.updates import UpdateRepository
from app.services.hub import ConnectionHub
from app.services.updates import UpdateService

logger = get_logger("dashboard")


class DashboardFiles(StaticFiles):
    """Frontend files. index.html is served without long caching so the iPad picks up a new build."""

    def file_response(self, full_path, stat_result, scope, status_code: int = 200):
        response = super().file_response(full_path, stat_result, scope, status_code)
        name = Path(str(full_path)).name
        if name == "index.html":
            response.headers["Cache-Control"] = "no-cache"
        if name.endswith(".webmanifest"):
            response.headers["Content-Type"] = "application/manifest+json"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.server_id = f"{uuid.uuid4().hex[:8]}_{int(time.time())}"
    settings = get_settings()
    configure_logging(settings.log_level)
    repository = UpdateRepository(settings.database_file)
    repository.migrate()
    removed = repository.prune(settings.retention_days)
    if removed:
        logger.info("startup retention removed %s rows", removed)
    app.state.service = UpdateService(repository, settings)
    app.state.hub = ConnectionHub()
    app.state.repository = repository
    logger.info("home dashboard listening static=%s", settings.static_path)
    yield
    repository.close()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="Home Dashboard",
        version=__version__,
        summary="Receives Ryuk's summaries and shows them on a wall-mounted iPad.",
        lifespan=lifespan,
    )
    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(AccessLogMiddleware)
    app.include_router(api_router)

    static_dir = settings.static_path
    if static_dir.is_dir():
        app.mount("/", DashboardFiles(directory=static_dir, html=True), name="spa")
        logger.info("serving frontend from %s", static_dir)
    else:
        logger.warning("frontend build not found at %s — API only", static_dir)
    return app


app = create_app()
