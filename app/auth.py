"""Porównanie tokenów w czasie stałym (skrót SHA-256, potem compare_digest)."""

import hashlib
import secrets

from fastapi import Header, HTTPException, Query, WebSocket

from app.config import Settings


def tokens_match(provided: str | None, expected: str | None) -> bool:
    """Zwraca True tylko gdy oba tokeny są niepuste i równe.

    Długość sekretu nie wycieka: porównywane są skróty stałej długości.
    Puste expected albo provided zawsze daje False, po wykonaniu porównania.
    """

    left = hashlib.sha256((provided or "").encode("utf-8")).digest()
    right = hashlib.sha256((expected or "\0").encode("utf-8")).digest()
    same = secrets.compare_digest(left, right)
    if not provided or not expected:
        return False
    return same


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def require_ingest_token(
    settings: Settings,
    authorization: str | None = Header(default=None),
) -> None:
    provided = bearer_token(authorization)
    if not tokens_match(provided, settings.dashboard_token):
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_read_token(
    settings: Settings,
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> None:
    """READ_TOKEN pusty oznacza otwarty odczyt (zakładamy LAN albo Tailscale)."""

    if not settings.read_token:
        return
    provided = bearer_token(authorization) or (token.strip() if token else None)
    if not tokens_match(provided, settings.read_token):
        raise HTTPException(status_code=401, detail="Unauthorized")


def authorize_websocket(websocket: WebSocket, settings: Settings) -> None:
    if not settings.read_token:
        return
    provided = websocket.query_params.get("token")
    header = websocket.headers.get("authorization")
    candidate = (provided.strip() if provided else None) or bearer_token(header)
    if not tokens_match(candidate, settings.read_token):
        raise HTTPException(status_code=401, detail="Unauthorized")
