"""Rooms data access."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.models import Device, Room


class RoomRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_with_device_counts(self) -> list[tuple[Room, int]]:
        stmt = (
            select(Room, func.count(Device.id))
            .outerjoin(Device, Device.room_id == Room.id)
            .group_by(Room.id)
            .order_by(Room.sort_order, Room.name)
        )
        result = await self._session.execute(stmt)
        return [(room, count) for room, count in result.all()]

    async def by_id(self, room_id: UUID) -> Room | None:
        return await self._session.get(Room, room_id)

    async def by_slug(self, slug: str) -> Room | None:
        return await self._session.scalar(select(Room).where(Room.slug == slug))

    async def device_count(self, room_id: UUID) -> int:
        return (
            await self._session.scalar(
                select(func.count(Device.id)).where(Device.room_id == room_id)
            )
        ) or 0

    def add(self, room: Room) -> None:
        self._session.add(room)

    async def delete(self, room: Room) -> None:
        await self._session.delete(room)
