"""hermes_conversations + hermes_messages data access."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.models import HermesConversation, HermesMessage


class HermesRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add_conversation(self, conversation: HermesConversation) -> None:
        self._session.add(conversation)

    async def conversation_by_id(
        self, conversation_id: UUID
    ) -> HermesConversation | None:
        return await self._session.get(HermesConversation, conversation_id)

    async def list_conversations(
        self, user_id: UUID, *, limit: int, offset: int
    ) -> tuple[list[HermesConversation], int]:
        total = (
            await self._session.scalar(
                select(func.count(HermesConversation.id)).where(
                    HermesConversation.user_id == user_id
                )
            )
        ) or 0
        rows = await self._session.scalars(
            select(HermesConversation)
            .where(HermesConversation.user_id == user_id)
            .order_by(HermesConversation.last_message_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows), total

    def add_message(self, message: HermesMessage) -> None:
        self._session.add(message)

    async def messages(
        self,
        conversation_id: UUID,
        *,
        limit: int,
        before: datetime | None = None,
    ) -> list[HermesMessage]:
        conditions = [HermesMessage.conversation_id == conversation_id]
        if before is not None:
            conditions.append(HermesMessage.created_at < before)
        # Fetch the newest `limit` messages, then return them ascending.
        rows = await self._session.scalars(
            select(HermesMessage)
            .where(*conditions)
            .order_by(HermesMessage.created_at.desc())
            .limit(limit)
        )
        return list(reversed(list(rows)))

    async def touch_conversation(
        self, conversation_id: UUID, at: datetime
    ) -> None:
        await self._session.execute(
            update(HermesConversation)
            .where(HermesConversation.id == conversation_id)
            .values(last_message_at=at)
        )
