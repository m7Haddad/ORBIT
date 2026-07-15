"""Scenes + scene_actions data access."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.models import Scene


class SceneRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self) -> list[Scene]:
        rows = await self._session.scalars(select(Scene).order_by(Scene.name))
        return list(rows.unique())

    async def by_id(self, scene_id: UUID) -> Scene | None:
        return await self._session.get(Scene, scene_id)

    async def by_slug(self, slug: str) -> Scene | None:
        return await self._session.scalar(select(Scene).where(Scene.slug == slug))

    def add(self, scene: Scene) -> None:
        self._session.add(scene)

    async def delete(self, scene: Scene) -> None:
        await self._session.delete(scene)
