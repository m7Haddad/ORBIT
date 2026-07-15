"""Audit service — every state-changing action lands here, attributed to its
actor, in the SAME transaction as the write it describes (an audited action and
its audit row commit or roll back together).

Action names are the closed taxonomy in docs/specs/audit-events.md; free-form
strings are a bug.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.principal import ActorType, Principal
from app.repositories.audit import AuditRepository
from app.repositories.models import AuditLog


class AuditService:
    async def record(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        action: str,
        target_type: str,
        target_id: UUID | None,
        before: Any = None,
        after: Any = None,
    ) -> AuditLog:
        entry = AuditLog(
            actor_type=principal.actor_type.value,
            actor_user_id=principal.user_id,
            actor_context=principal.context or {},
            action=action,
            target_type=target_type,
            target_id=target_id,
            before_state=before,
            after_state=after,
        )
        AuditRepository(session).add(entry)
        await session.flush()  # materialise the id for API responses
        return entry

    async def query(
        self,
        session: AsyncSession,
        *,
        actor_type: str | None = None,
        actor_user_id: UUID | None = None,
        action: str | None = None,
        target_type: str | None = None,
        target_id: UUID | None = None,
        from_: datetime | None = None,
        to: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AuditLog], int]:
        return await AuditRepository(session).query(
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            from_=from_,
            to=to,
            limit=limit,
            offset=offset,
        )


def system_principal(actor: ActorType, context: dict[str, Any] | None = None) -> Principal:
    """Principal for backend-emitted audit entries attributed to a service actor
    (e.g. n8n.event.delivered in Stage 5)."""
    return Principal(actor_type=actor, context=context or {})
