"""Constant-time token comparison (SHA-256 digest, then compare_digest)."""

from __future__ import annotations

import hashlib
import secrets

from fastapi import Header, HTTPException, Query

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
    """An empty READ_TOKEN means open reads (LAN or Tailscale is assumed)."""

    if not settings.read_token:
        return
    provided = bearer_token(authorization) or (token.strip() if token else None)
    if not tokens_match(provided, settings.read_token):
        raise HTTPException(status_code=401, detail="Unauthorized")
