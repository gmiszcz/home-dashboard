"""Zależności FastAPI: token zapisu i opcjonalny token odczytu."""

from typing import Annotated

from fastapi import Depends, Header, Query, Request

from app.auth import require_ingest_token, require_read_token
from app.config import get_settings
from app.services.hub import ConnectionHub
from app.services.updates import UpdateService


def get_service(request: Request) -> UpdateService:
    return request.app.state.service


def get_hub(request: Request) -> ConnectionHub:
    return request.app.state.hub


def ingest_auth(authorization: Annotated[str | None, Header()] = None) -> None:
    require_ingest_token(get_settings(), authorization)


def read_auth(
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str | None, Query()] = None,
) -> None:
    require_read_token(get_settings(), authorization, token)


ServiceDep = Annotated[UpdateService, Depends(get_service)]
HubDep = Annotated[ConnectionHub, Depends(get_hub)]
IngestAuth = Annotated[None, Depends(ingest_auth)]
ReadAuth = Annotated[None, Depends(read_auth)]
