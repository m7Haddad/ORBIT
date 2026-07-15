from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

from app.api.deps import PrincipalDep, SessionDep, get_settings_dep
from app.services.auth_service import AuthError, AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/login")
async def login(
    body: LoginRequest, request: Request, session: SessionDep, auth: AuthServiceDep
) -> dict:
    ip = _client_ip(request)
    limiter = request.app.state.login_limiter
    if not limiter.allow(ip or "unknown"):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "rate_limited", "message": "too many login attempts"},
        )
    try:
        pair = await auth.login(
            session,
            email=body.email,
            password=body.password,
            ip=ip,
            user_agent=request.headers.get("user-agent"),
        )
    except AuthError:
        await session.commit()  # persist the auth.login.failed audit row
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_credentials", "message": "invalid credentials"},
        )
    await session.commit()
    return pair


@router.post("/refresh")
async def refresh(body: RefreshRequest, session: SessionDep, auth: AuthServiceDep) -> dict:
    try:
        pair = await auth.refresh(session, refresh_token=body.refresh_token)
    except AuthError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_refresh_token", "message": str(exc)},
        )
    await session.commit()
    return pair


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: RefreshRequest,
    session: SessionDep,
    auth: AuthServiceDep,
    principal: PrincipalDep,
) -> None:
    try:
        await auth.logout(
            session, refresh_token=body.refresh_token, principal=principal
        )
    except AuthError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unknown_session", "message": str(exc)},
        )
    await session.commit()


@router.get("/me")
async def me(principal: PrincipalDep) -> dict:
    return {
        "id": str(principal.user_id) if principal.user_id else None,
        "email": principal.email,
        "display_name": principal.display_name or principal.actor_type.value,
        "role": principal.role,
        "actor_type": principal.actor_type.value,
    }
