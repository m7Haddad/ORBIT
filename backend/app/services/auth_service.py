"""Login / refresh-rotation / logout, with audit entries per audit-events.md."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import verify_password
from app.auth.tokens import create_access_token, hash_refresh_token, new_refresh_token
from app.config import Settings
from app.domain.principal import ActorType, Principal
from app.repositories.models import User
from app.repositories.users import SessionRepository, UserRepository
from app.services.audit import AuditService
from app.utils.logging import get_logger

log = get_logger(__name__)


class AuthError(Exception):
    """Invalid credentials / token — always maps to 401."""


class AuthService:
    def __init__(self, settings: Settings, audit: AuditService) -> None:
        self._settings = settings
        self._audit = audit

    async def login(
        self,
        session: AsyncSession,
        *,
        email: str,
        password: str,
        ip: str | None,
        user_agent: str | None,
    ) -> dict:
        user = await UserRepository(session).by_email(email)
        if user is None or not user.is_active or not verify_password(
            user.password_hash, password
        ):
            await self._record_failure(session, user=user, email=email, ip=ip)
            raise AuthError("invalid credentials")

        pair, auth_session = await self._issue_session(
            session, user=user, ip=ip, user_agent=user_agent
        )
        await self._audit.record(
            session,
            principal=self._principal(user),
            action="auth.login",
            target_type="user",
            target_id=user.id,
            after={"session_id": str(auth_session.id), "ip": ip, "user_agent": user_agent},
        )
        return pair

    async def refresh(self, session: AsyncSession, *, refresh_token: str) -> dict:
        sessions = SessionRepository(session)
        auth_session = await sessions.active_by_token_hash(
            hash_refresh_token(refresh_token)
        )
        if auth_session is None:
            raise AuthError("invalid or expired refresh token")
        user = await UserRepository(session).by_id(auth_session.user_id)
        if user is None or not user.is_active:
            raise AuthError("user unavailable")

        # Rotation: the presented token is revoked and replaced.
        await sessions.revoke(auth_session.id)
        pair, new_session = await self._issue_session(
            session,
            user=user,
            ip=auth_session.ip_address,
            user_agent=auth_session.user_agent,
        )
        await self._audit.record(
            session,
            principal=self._principal(user),
            action="auth.refresh.rotated",
            target_type="user",
            target_id=user.id,
            before={"session_id": str(auth_session.id)},
            after={"session_id": str(new_session.id)},
        )
        return pair

    async def logout(self, session: AsyncSession, *, refresh_token: str,
                     principal: Principal) -> None:
        sessions = SessionRepository(session)
        auth_session = await sessions.active_by_token_hash(
            hash_refresh_token(refresh_token)
        )
        if auth_session is None or auth_session.user_id != principal.user_id:
            raise AuthError("unknown session")
        await sessions.revoke(auth_session.id)
        await self._audit.record(
            session,
            principal=principal,
            action="auth.logout",
            target_type="user",
            target_id=principal.user_id,
            before={"session_id": str(auth_session.id)},
        )

    async def _issue_session(
        self, session: AsyncSession, *, user: User, ip: str | None,
        user_agent: str | None
    ):
        raw_refresh, refresh_hash = new_refresh_token()
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=self._settings.refresh_token_ttl_days
        )
        auth_session = await SessionRepository(session).create(
            user_id=user.id,
            refresh_token_hash=refresh_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip,
        )
        access = create_access_token(
            self._settings,
            sub=str(user.id),
            actor_type=ActorType.USER.value,
            extra={"role": user.role},
        )
        pair = {
            "access_token": access,
            "refresh_token": raw_refresh,
            "token_type": "bearer",
            "expires_in": self._settings.access_token_ttl_seconds,
        }
        return pair, auth_session

    async def _record_failure(
        self, session: AsyncSession, *, user: User | None, email: str, ip: str | None
    ) -> None:
        # Spec conflict, resolved conservatively (flagged in the Stage 2 report):
        # audit-events.md wants auth.login.failed even for unknown emails with a
        # NULL actor_user_id, but the schema CHECK requires actor_user_id when
        # actor_type='user'. Known users get the audit row; unknown emails get a
        # structured log line only, until the schema decision is made.
        if user is None:
            log.warning("login_failed_unknown_email", email=email, ip=ip)
            return
        await self._audit.record(
            session,
            principal=self._principal(user),
            action="auth.login.failed",
            target_type="user",
            target_id=user.id,
            after={"email": email, "ip": ip},
        )

    @staticmethod
    def _principal(user: User) -> Principal:
        return Principal(
            actor_type=ActorType.USER,
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
        )
