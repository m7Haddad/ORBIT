from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field

from app.api.deps import HermesDep, PrincipalDep, SessionDep
from app.repositories.ai_usage import AiUsageRepository
from app.repositories.models import AiUsageLog

router = APIRouter(prefix="/ai", tags=["ai"])


class AiUsageCreate(BaseModel):
    conversation_id: UUID | None = None
    message_id: UUID | None = None
    model: str = Field(min_length=1)
    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)
    cost_usd: float = Field(ge=0)
    latency_ms: int | None = None


def _entry_dict(e: AiUsageLog) -> dict:
    return {
        "id": str(e.id),
        "conversation_id": str(e.conversation_id) if e.conversation_id else None,
        "message_id": str(e.message_id) if e.message_id else None,
        "model": e.model,
        "prompt_tokens": e.prompt_tokens,
        "completion_tokens": e.completion_tokens,
        "total_tokens": e.total_tokens,
        "cost_usd": float(e.cost_usd),
        "latency_ms": e.latency_ms,
        "created_at": e.created_at.isoformat(),
    }


@router.get("/usage")
async def query_usage(
    session: SessionDep,
    principal: PrincipalDep,
    conversation_id: UUID | None = None,
    model: str | None = None,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    group_by: Annotated[str | None, Query(pattern="^(model|day|conversation)$")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    repo = AiUsageRepository(session)
    if group_by:
        data = await repo.aggregate(
            group_by=group_by,
            conversation_id=conversation_id,
            model=model,
            from_=from_,
            to=to,
            limit=limit,
            offset=offset,
        )
        return {"data": data, "meta": {"total": len(data), "limit": limit, "offset": offset}}
    rows, total = await repo.query(
        conversation_id=conversation_id,
        model=model,
        from_=from_,
        to=to,
        limit=limit,
        offset=offset,
    )
    return {
        "data": [_entry_dict(e) for e in rows],
        "meta": {"total": total, "limit": limit, "offset": offset},
    }


@router.post("/usage", status_code=status.HTTP_201_CREATED)
async def record_usage(
    body: AiUsageCreate, session: SessionDep, principal: HermesDep
) -> dict:
    entry = AiUsageLog(
        conversation_id=body.conversation_id,
        message_id=body.message_id,
        model=body.model,
        prompt_tokens=body.prompt_tokens,
        completion_tokens=body.completion_tokens,
        cost_usd=body.cost_usd,
        latency_ms=body.latency_ms,
    )
    AiUsageRepository(session).add(entry)
    await session.commit()
    await session.refresh(entry)  # pick up generated total_tokens + defaults
    return _entry_dict(entry)
