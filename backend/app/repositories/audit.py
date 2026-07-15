"""audit_log data access."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.models import AuditLog


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, entry: AuditLog) -> None:
        self._session.add(entry)

    async def query(
        self,
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
        conditions: list[Any] = []
        if actor_type:
            conditions.append(AuditLog.actor_type == actor_type)
        if actor_user_id:
            conditions.append(AuditLog.actor_user_id == actor_user_id)
        if action:
            conditions.append(AuditLog.action == action)
        if target_type:
            conditions.append(AuditLog.target_type == target_type)
        if target_id:
            conditions.append(AuditLog.target_id == target_id)
        if from_:
            conditions.append(AuditLog.created_at >= from_)
        if to:
            conditions.append(AuditLog.created_at <= to)

        total = (
            await self._session.scalar(
                select(func.count(AuditLog.id)).where(*conditions)
            )
        ) or 0
        rows = await self._session.scalars(
            select(AuditLog)
            .where(*conditions)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows), total
