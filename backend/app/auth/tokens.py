"""JWT access tokens + opaque refresh tokens.

- Access tokens: short-lived HS256 JWTs. Users carry sub=<user uuid>,
  actor_type="user". Service principals (Hermes, n8n) carry
  sub="service:<name>", actor_type="hermes"|"n8n" and long expiry — minted
  offline by scripts/issue_service_token.py from backend config.
- Refresh tokens: opaque random strings; only their sha256 lands in
  auth_sessions (rotated on every use).
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.config import Settings


class TokenError(Exception):
    pass


def create_access_token(settings: Settings, *, sub: str, actor_type: str,
                        ttl_seconds: int | None = None,
                        extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    ttl = ttl_seconds if ttl_seconds is not None else settings.access_token_ttl_seconds
    payload: dict[str, Any] = {
        "sub": sub,
        "actor_type": actor_type,
        "iss": settings.jwt_issuer,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(settings: Settings, token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc


def new_refresh_token() -> tuple[str, str]:
    """Returns (raw token for the client, sha256 hex for auth_sessions)."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
