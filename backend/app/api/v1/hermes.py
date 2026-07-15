"""Hermes persistence endpoints — hermes-service-principal only.

Hermes stores nothing locally (CLAUDE.md constraint #2): conversations,
messages, and usage all live here. These are `internal: true` entries in
hermes-tool-manifest.json — never exposed to the LLM as callable tools.
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import HermesDep, SessionDep
from app.repositories.hermes import HermesRepository
from app.repositories.models import HermesConversation, HermesMessage
from app.repositories.users import UserRepository

router = APIRouter(prefix="/hermes", tags=["hermes"])

ROLES = {"user", "assistant", "system", "tool"}
CHANNELS = {"dashboard", "telegram"}


class ConversationCreate(BaseModel):
    user_id: UUID
    title: str | None = None
    metadata: dict[str, Any] = {}


class MessageCreate(BaseModel):
    role: str
    channel: str
    content: str = ""
    tool_calls: list[dict[str, Any]] | None = None


class MessagesWrite(BaseModel):
    messages: list[MessageCreate] = Field(min_length=1)


def _conversation_dict(c: HermesConversation) -> dict:
    return {
        "id": str(c.id),
        "user_id": str(c.user_id),
        "title": c.title,
        "started_at": c.started_at.isoformat(),
        "last_message_at": c.last_message_at.isoformat(),
        "metadata": c.metadata_,
    }


async def _conversation_or_404(session, conversation_id: UUID) -> HermesConversation:
    conversation = await HermesRepository(session).conversation_by_id(conversation_id)
    if conversation is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"code": "conversation_not_found", "message": "conversation not found"},
        )
    return conversation


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate, session: SessionDep, principal: HermesDep
) -> dict:
    if await UserRepository(session).by_id(body.user_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "unknown_user", "message": "user_id does not exist"},
        )
    conversation = HermesConversation(
        user_id=body.user_id, title=body.title, metadata_=body.metadata
    )
    HermesRepository(session).add_conversation(conversation)
    await session.commit()
    await session.refresh(conversation)
    return _conversation_dict(conversation)


@router.get("/conversations")
async def list_conversations(
    session: SessionDep,
    principal: HermesDep,
    user_id: UUID,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    conversations, total = await HermesRepository(session).list_conversations(
        user_id, limit=limit, offset=offset
    )
    return {
        "data": [_conversation_dict(c) for c in conversations],
        "meta": {"total": total, "limit": limit, "offset": offset},
    }


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: UUID,
    session: SessionDep,
    principal: HermesDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    before: datetime | None = None,
) -> dict:
    await _conversation_or_404(session, conversation_id)
    messages = await HermesRepository(session).messages(
        conversation_id, limit=limit, before=before
    )
    return {
        "data": [
            {
                "id": str(m.id),
                "conversation_id": str(m.conversation_id),
                "role": m.role,
                "channel": m.channel,
                "content": m.content,
                "tool_calls": m.tool_calls,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]
    }


@router.post(
    "/conversations/{conversation_id}/messages",
    status_code=status.HTTP_201_CREATED,
)
async def persist_messages(
    conversation_id: UUID,
    body: MessagesWrite,
    session: SessionDep,
    principal: HermesDep,
) -> dict:
    await _conversation_or_404(session, conversation_id)
    for message in body.messages:
        if message.role not in ROLES or message.channel not in CHANNELS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "invalid_message",
                    "message": f"role must be in {sorted(ROLES)}, channel in {sorted(CHANNELS)}",
                },
            )

    repo = HermesRepository(session)
    created: list[HermesMessage] = []
    now = datetime.now(timezone.utc)
    for index, message in enumerate(body.messages):
        row = HermesMessage(
            conversation_id=conversation_id,
            role=message.role,
            channel=message.channel,
            content=message.content,
            tool_calls=message.tool_calls,
            # Explicit, strictly-increasing timestamps: rows in one batch would
            # otherwise share the transaction's now() and lose turn order.
            created_at=now + timedelta(microseconds=index),
        )
        repo.add_message(row)
        created.append(row)
    await repo.touch_conversation(conversation_id, now)
    await session.commit()
    for row in created:
        await session.refresh(row)
    return {
        "conversation_id": str(conversation_id),
        "message_ids": [str(row.id) for row in created],
        "last_message_at": now.isoformat(),
    }
