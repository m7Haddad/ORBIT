from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi import Depends

from app.api.deps import PrincipalDep, SessionDep
from app.services.audit import AuditService

router = APIRouter(prefix="/audit-log", tags=["audit"])


def get_audit_service(request: Request) -> AuditService:
    return request.app.state.audit_service


@router.get("")
async def query_audit_log(
    session: SessionDep,
    principal: PrincipalDep,
    audit: Annotated[AuditService, Depends(get_audit_service)],
    actor_type: Annotated[str | None, Query(pattern="^(user|hermes|n8n)$")] = None,
    actor_user_id: UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    target_id: UUID | None = None,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    entries, total = await audit.query(
        session,
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
    return {
        "data": [
            {
                "id": str(e.id),
                "actor_type": e.actor_type,
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
                "actor_context": e.actor_context,
                "action": e.action,
                "target_type": e.target_type,
                "target_id": str(e.target_id) if e.target_id else None,
                "before_state": e.before_state,
                "after_state": e.after_state,
                "created_at": e.created_at.isoformat(),
            }
            for e in entries
        ],
        "meta": {"total": total, "limit": limit, "offset": offset},
    }
