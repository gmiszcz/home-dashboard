"""Constant-time token comparison (SHA-256 digest, then compare_digest)."""

from __future__ import annotations

import hashlib
import secrets

from fastapi import HTTPException

from app.config import Settings


def tokens_match(provided: str | None, expected: str | None) -> bool:
    """Returns True only when both tokens are non-empty and equal.

    The secret's length does not leak: fixed-length digests are compared.
    An empty expected or provided value always yields False, after the comparison runs.
    """

    left = hashlib.sha256((provided or "").encode("utf-8")).digest()
    right = hashlib.sha256((expected or "\0").encode("utf-8")).digest()
    same = secrets.compare_digest(left, right)
    if not provided or not expected:
        return False
    return same


def bearer_token(authorization: str | None) -> str | None:
    """Extracts the token from an `Authorization: Bearer <token>` header value.

    Args:
        authorization: The raw header value, or None when the header is absent.

    Returns:
        The stripped token, or None when the scheme is not Bearer or the token is blank.
    """

    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def is_read_authorized(
    settings: Settings, authorization: str | None = None, token: str | None = None
) -> bool:
    """Checks the read token for HTTP reads and the WebSocket alike.

    An empty READ_TOKEN means open reads (LAN or Tailscale is assumed). Otherwise the
    Authorization header wins and the `token` query value is only used without a header token.

    Args:
        settings: Process settings holding the expected read token.
        authorization: The raw Authorization header value.
        token: The `token` query parameter.

    Returns:
        True when reads are open or the provided token matches.
    """

    if not settings.read_token:
        return True
    provided = bearer_token(authorization) or (token.strip() if token else None)
    return tokens_match(provided, settings.read_token)


def require_ingest_token(settings: Settings, authorization: str | None = None) -> None:
    """Raises HTTP 401 unless the Authorization header carries the ingest token."""

    if not tokens_match(bearer_token(authorization), settings.dashboard_token):
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_read_token(
    settings: Settings, authorization: str | None = None, token: str | None = None
) -> None:
    """Raises HTTP 401 unless `is_read_authorized` accepts the credentials."""

    if not is_read_authorized(settings, authorization, token):
        raise HTTPException(status_code=401, detail="Unauthorized")
