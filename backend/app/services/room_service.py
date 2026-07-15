"""Rooms — user-only CRUD, audited."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.principal import Principal
from app.repositories.models import Room
from app.repositories.rooms import RoomRepository
from app.services.audit import AuditService
from app.utils.text import slugify


class RoomService:
    def __init__(self, audit: AuditService) -> None:
        self._audit = audit

    async def create(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        name: str,
        slug: str | None,
        icon: str | None,
        sort_order: int,
    ) -> Room:
        # Explicit slugs conflict loudly (409 in the router); generated ones
        # auto-suffix so "Office" can be created twice without a 500.
        if slug is None:
            slug = await self._unique_slug(session, name)
        room = Room(name=name, slug=slug, icon=icon, sort_order=sort_order)
        RoomRepository(session).add(room)
        await session.flush()
        await self._audit.record(
            session,
            principal=principal,
            action="room.created",
            target_type="room",
            target_id=room.id,
            after=_room_snapshot(room),
        )
        return room

    async def update(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        room: Room,
        changes: dict[str, Any],
    ) -> Room:
        before = {key: getattr(room, key) for key in changes}
        for key, value in changes.items():
            setattr(room, key, value)
        await session.flush()
        await self._audit.record(
            session,
            principal=principal,
            action="room.updated",
            target_type="room",
            target_id=room.id,
            before=before,
            after=changes,
        )
        return room

    async def delete(
        self, session: AsyncSession, *, principal: Principal, room: Room
    ) -> None:
        # Devices are unassigned (room_id → NULL via FK), not deleted.
        await self._audit.record(
            session,
            principal=principal,
            action="room.deleted",
            target_type="room",
            target_id=room.id,
            before=_room_snapshot(room),
        )
        await RoomRepository(session).delete(room)

    async def _unique_slug(self, session: AsyncSession, name: str) -> str:
        repo = RoomRepository(session)
        base = slugify(name)
        slug, n = base, 2
        while await repo.by_slug(slug) is not None:
            slug = f"{base}-{n}"
            n += 1
        return slug


def _room_snapshot(room: Room) -> dict[str, Any]:
    return {
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
        "icon": room.icon,
        "sort_order": room.sort_order,
    }
