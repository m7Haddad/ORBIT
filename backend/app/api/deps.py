"""Dependency injection for the API layer.

Singletons (engine, MQTT module, event bus, services) live on app.state, wired
in the lifespan; requests get them through these dependencies. The Principal
dependency is the single place bearer tokens become actors.
"""

import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.tokens import TokenError, decode_token
from app.config import Settings
from app.domain.principal import ActorType, Principal
from app.repositories.users import UserRepository

_bearer = HTTPBearer(auto_error=False)

_CONTEXT_HEADERS = {
    ActorType.HERMES: "X-Hermes-Context",
    ActorType.N8N: "X-N8N-Context",
}


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail={"code": "unauthorized", "message": message},
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_principal(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> Principal:
    if credentials is None:
        raise _unauthorized("missing bearer token")
    try:
        payload = decode_token(settings, credentials.credentials)
    except TokenError as exc:
        raise _unauthorized(str(exc))

    actor = payload.get("actor_type")
    if actor == ActorType.USER.value:
        try:
            user_id = UUID(payload.get("sub", ""))
        except ValueError:
            raise _unauthorized("malformed subject")
        user = await UserRepository(session).by_id(user_id)
        if user is None or not user.is_active:
            raise _unauthorized("user unavailable")
        return Principal(
            actor_type=ActorType.USER,
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
        )

    if actor in (ActorType.HERMES.value, ActorType.N8N.value):
        actor_type = ActorType(actor)
        return Principal(
            actor_type=actor_type,
            context=_parse_context(request, actor_type),
        )

    raise _unauthorized("unknown actor type")


def _parse_context(request: Request, actor: ActorType) -> dict:
    """X-Hermes-Context / X-N8N-Context → audit_log.actor_context."""
    raw = request.headers.get(_CONTEXT_HEADERS[actor], "")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _forbidden(message: str) -> HTTPException:
    return HTTPException(
        status.HTTP_403_FORBIDDEN,
        detail={"code": "forbidden", "message": message},
    )


async def require_user(
    principal: Annotated[Principal, Depends(get_principal)],
) -> Principal:
    """Lifecycle/definition endpoints — user-only by design (devices, rooms,
    scene definitions are never touched by Hermes or n8n)."""
    if not principal.is_user:
        raise _forbidden("this endpoint is user-only")
    return principal


def require_actor(*allowed: ActorType):
    async def dependency(
        principal: Annotated[Principal, Depends(get_principal)],
    ) -> Principal:
        if principal.actor_type not in allowed:
            raise _forbidden(
                f"allowed actors: {', '.join(a.value for a in allowed)}"
            )
        return principal

    return dependency


require_hermes = require_actor(ActorType.HERMES)

PrincipalDep = Annotated[Principal, Depends(get_principal)]
UserDep = Annotated[Principal, Depends(require_user)]
HermesDep = Annotated[Principal, Depends(require_hermes)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
