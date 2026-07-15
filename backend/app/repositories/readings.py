"""capability_readings data access, including server-side downsampling."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Interval, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.models import CapabilityReading

_EPOCH = text("TIMESTAMPTZ '1970-01-01 00:00:00+00'")

_AGGREGATES = {
    "avg": func.avg,
    "min": func.min,
    "max": func.max,
}


class ReadingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(
        self,
        *,
        device_capability_id: UUID,
        columns: dict[str, Any],
        recorded_at: datetime,
    ) -> CapabilityReading:
        reading = CapabilityReading(
            device_capability_id=device_capability_id,
            recorded_at=recorded_at,
            **columns,
        )
        self._session.add(reading)
        return reading

    async def latest(self, device_capability_id: UUID) -> CapabilityReading | None:
        return await self._session.scalar(
            select(CapabilityReading)
            .where(CapabilityReading.device_capability_id == device_capability_id)
            .order_by(CapabilityReading.recorded_at.desc())
            .limit(1)
        )

    async def latest_many(
        self, capability_ids: list[UUID]
    ) -> dict[UUID, CapabilityReading]:
        """Latest reading per capability (DISTINCT ON)."""
        if not capability_ids:
            return {}
        stmt = (
            select(CapabilityReading)
            .distinct(CapabilityReading.device_capability_id)
            .where(CapabilityReading.device_capability_id.in_(capability_ids))
            .order_by(
                CapabilityReading.device_capability_id,
                CapabilityReading.recorded_at.desc(),
            )
        )
        rows = await self._session.scalars(stmt)
        return {r.device_capability_id: r for r in rows}

    async def raw_range(
        self,
        device_capability_id: UUID,
        *,
        from_: datetime,
        to: datetime,
        limit: int,
    ) -> list[CapabilityReading]:
        rows = await self._session.scalars(
            select(CapabilityReading)
            .where(
                CapabilityReading.device_capability_id == device_capability_id,
                CapabilityReading.recorded_at >= from_,
                CapabilityReading.recorded_at <= to,
            )
            .order_by(CapabilityReading.recorded_at)
            .limit(limit)
        )
        return list(rows)

    async def downsampled_numeric(
        self,
        device_capability_id: UUID,
        *,
        from_: datetime,
        to: datetime,
        interval_seconds: int,
        aggregate: str,
        limit: int,
    ) -> list[tuple[datetime, float | None]]:
        """date_bin buckets over value_numeric with avg/min/max."""
        bucket = func.date_bin(
            cast(text(f"'{interval_seconds} seconds'"), Interval),
            CapabilityReading.recorded_at,
            _EPOCH,
        ).label("bucket")
        agg = _AGGREGATES[aggregate](CapabilityReading.value_numeric)
        stmt = (
            select(bucket, agg)
            .where(
                CapabilityReading.device_capability_id == device_capability_id,
                CapabilityReading.recorded_at >= from_,
                CapabilityReading.recorded_at <= to,
            )
            .group_by(bucket)
            .order_by(bucket)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return [(b, v) for b, v in result.all()]

    async def downsampled_last(
        self,
        device_capability_id: UUID,
        *,
        from_: datetime,
        to: datetime,
        interval_seconds: int,
        limit: int,
    ) -> list[CapabilityReading]:
        """Last reading per bucket — works for every data_type."""
        bucket = func.date_bin(
            cast(text(f"'{interval_seconds} seconds'"), Interval),
            CapabilityReading.recorded_at,
            _EPOCH,
        ).label("bucket")
        stmt = (
            select(CapabilityReading, bucket)
            .distinct(bucket)
            .where(
                CapabilityReading.device_capability_id == device_capability_id,
                CapabilityReading.recorded_at >= from_,
                CapabilityReading.recorded_at <= to,
            )
            .order_by(bucket, CapabilityReading.recorded_at.desc())
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return [row[0] for row in result.all()]
