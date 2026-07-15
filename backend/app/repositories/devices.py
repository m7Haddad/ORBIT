"""Devices + device_capabilities data access."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.models import Device, DeviceCapability


class DeviceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(
        self,
        *,
        room_id: UUID | None = None,
        type_: str | None = None,
        online: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Device], int]:
        from sqlalchemy import func

        conditions = []
        if room_id is not None:
            conditions.append(Device.room_id == room_id)
        if type_ is not None:
            conditions.append(Device.type == type_)
        if online is not None:
            conditions.append(Device.is_online == online)

        total = (
            await self._session.scalar(
                select(func.count(Device.id)).where(*conditions)
            )
        ) or 0
        rows = await self._session.scalars(
            select(Device)
            .where(*conditions)
            .order_by(Device.created_at)
            .limit(limit)
            .offset(offset)
        )
        return list(rows.unique()), total

    async def by_id(self, device_id: UUID) -> Device | None:
        return await self._session.get(Device, device_id)

    def add(self, device: Device) -> None:
        self._session.add(device)

    async def delete(self, device: Device) -> None:
        await self._session.delete(device)

    async def capability(
        self, device_id: UUID, capability: str
    ) -> DeviceCapability | None:
        return await self._session.scalar(
            select(DeviceCapability).where(
                DeviceCapability.device_id == device_id,
                DeviceCapability.capability == capability,
            )
        )

    async def capability_by_id(self, cap_id: UUID) -> DeviceCapability | None:
        return await self._session.get(DeviceCapability, cap_id)

    async def set_availability(
        self, device_id: UUID, *, online: bool, last_seen: datetime
    ) -> bool:
        """Returns True when the flag actually changed (edge, not level)."""
        result = await self._session.execute(
            update(Device)
            .where(Device.id == device_id, Device.is_online != online)
            .values(is_online=online, last_seen=last_seen, updated_at=last_seen)
        )
        if result.rowcount == 0:
            # No transition — still stamp last_seen.
            await self._session.execute(
                update(Device)
                .where(Device.id == device_id)
                .values(last_seen=last_seen)
            )
            return False
        return True
