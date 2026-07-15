"""ai_usage_log data access."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import cast, func, select, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.models import AiUsageLog


class AiUsageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, entry: AiUsageLog) -> None:
        self._session.add(entry)

    def _conditions(
        self,
        conversation_id: UUID | None,
        model: str | None,
        from_: datetime | None,
        to: datetime | None,
    ) -> list[Any]:
        conditions: list[Any] = []
        if conversation_id:
            conditions.append(AiUsageLog.conversation_id == conversation_id)
        if model:
            conditions.append(AiUsageLog.model == model)
        if from_:
            conditions.append(AiUsageLog.created_at >= from_)
        if to:
            conditions.append(AiUsageLog.created_at <= to)
        return conditions

    async def query(
        self,
        *,
        conversation_id: UUID | None = None,
        model: str | None = None,
        from_: datetime | None = None,
        to: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AiUsageLog], int]:
        conditions = self._conditions(conversation_id, model, from_, to)
        total = (
            await self._session.scalar(
                select(func.count(AiUsageLog.id)).where(*conditions)
            )
        ) or 0
        rows = await self._session.scalars(
            select(AiUsageLog)
            .where(*conditions)
            .order_by(AiUsageLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows), total

    async def aggregate(
        self,
        *,
        group_by: str,
        conversation_id: UUID | None = None,
        model: str | None = None,
        from_: datetime | None = None,
        to: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        group_column = {
            "model": AiUsageLog.model,
            "day": cast(AiUsageLog.created_at, Date),
            "conversation": AiUsageLog.conversation_id,
        }[group_by]
        stmt = (
            select(
                group_column.label("group"),
                func.count(AiUsageLog.id).label("request_count"),
                func.coalesce(func.sum(AiUsageLog.total_tokens), 0).label("total_tokens"),
                func.coalesce(func.sum(AiUsageLog.cost_usd), 0).label("total_cost_usd"),
            )
            .where(*self._conditions(conversation_id, model, from_, to))
            .group_by(group_column)
            .order_by(group_column)
            .limit(limit)
            .offset(offset)
        )
        result = await self._session.execute(stmt)
        return [
            {
                "group": str(row.group),
                "request_count": row.request_count,
                "total_tokens": int(row.total_tokens),
                "total_cost_usd": float(row.total_cost_usd),
            }
            for row in result.all()
        ]
