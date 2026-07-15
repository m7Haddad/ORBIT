"""The REST↔MQTT capability bridge.

Reads come from the latest capability_readings row; writes are validated,
audited at acceptance (202) with a request_id, then published to
{prefix}/devices/{id}/{capability}/set. Confirmation arrives independently via
the state topic → ingest → WebSocket. No conditions, no rules — writes do
exactly what the caller asked.
"""

import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import capability_values
from app.domain.principal import Principal
from app.mqtt.client import MqttModule
from app.repositories.devices import DeviceRepository
from app.repositories.models import Device, DeviceCapability
from app.repositories.readings import ReadingRepository
from app.services.audit import AuditService

_INTERVAL_RE = re.compile(r"^(\d+)(s|m|h|d)$")
_INTERVAL_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


class CapabilityError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class CapabilityService:
    def __init__(self, mqtt: MqttModule, audit: AuditService) -> None:
        self._mqtt = mqtt
        self._audit = audit

    # --------------------------------------------------------------- reads ---
    async def state(
        self, session: AsyncSession, cap: DeviceCapability
    ) -> dict[str, Any]:
        latest = await ReadingRepository(session).latest(cap.id)
        return capability_state_dict(cap, latest)

    # -------------------------------------------------------------- writes ---
    async def command(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        device: Device,
        cap: DeviceCapability,
        value: Any,
    ) -> dict[str, Any]:
        if cap.access not in ("write", "read_write"):
            raise CapabilityError("not_writable", f"{cap.capability} is read-only")
        if not device.is_online:
            raise CapabilityError("device_offline", f"{device.name} is offline")
        try:
            validated = capability_values.validate_value(
                cap.data_type, cap.config or {}, value
            )
        except capability_values.CapabilityValueError as exc:
            raise CapabilityError("invalid_value", str(exc)) from exc

        request_id = uuid4()
        latest = await ReadingRepository(session).latest(cap.id)
        before_value = (
            capability_values.from_reading_columns(
                cap.data_type, latest.value_numeric, latest.value_text, latest.value_json
            )
            if latest
            else None
        )
        # Audit at acceptance — intent + attribution; confirmed state arrives
        # via the state topic into capability_readings (audit-events.md).
        entry = await self._audit.record(
            session,
            principal=principal,
            action="device.capability.write",
            target_type="capability",
            target_id=cap.id,
            before={"value": before_value},
            after={"value": validated, "request_id": str(request_id)},
        )
        await session.commit()

        topic = await self._mqtt.publish_command(
            device.id, cap.capability, validated, request_id
        )
        return {
            "request_id": str(request_id),
            "published_topic": topic,
            "audit_id": str(entry.id),
        }

    # ------------------------------------------------------------- history ---
    async def readings(
        self,
        session: AsyncSession,
        cap: DeviceCapability,
        *,
        from_: datetime,
        to: datetime | None,
        interval: str | None,
        aggregate: str,
        limit: int,
    ) -> dict[str, Any]:
        to = to or datetime.now(timezone.utc)
        repo = ReadingRepository(session)

        if interval is None:
            rows = await repo.raw_range(cap.id, from_=from_, to=to, limit=limit)
            data = [
                {
                    "value": capability_values.from_reading_columns(
                        cap.data_type, r.value_numeric, r.value_text, r.value_json
                    ),
                    "recorded_at": r.recorded_at.isoformat(),
                }
                for r in rows
            ]
        else:
            match = _INTERVAL_RE.match(interval)
            if not match:
                raise CapabilityError("invalid_interval", "interval must match \\d+(s|m|h|d)")
            seconds = int(match.group(1)) * _INTERVAL_SECONDS[match.group(2)]
            numeric = cap.data_type in ("float", "int", "bool")
            if aggregate == "last" or not numeric:
                if aggregate != "last":
                    raise CapabilityError(
                        "invalid_aggregate",
                        f"{aggregate} requires a numeric capability; use aggregate=last",
                    )
                rows = await repo.downsampled_last(
                    cap.id, from_=from_, to=to, interval_seconds=seconds, limit=limit
                )
                data = [
                    {
                        "value": capability_values.from_reading_columns(
                            cap.data_type, r.value_numeric, r.value_text, r.value_json
                        ),
                        "recorded_at": r.recorded_at.isoformat(),
                    }
                    for r in rows
                ]
            else:
                buckets = await repo.downsampled_numeric(
                    cap.id, from_=from_, to=to, interval_seconds=seconds,
                    aggregate=aggregate, limit=limit,
                )
                data = [
                    {"value": value, "recorded_at": bucket.isoformat()}
                    for bucket, value in buckets
                ]

        return {
            "device_id": str(cap.device_id),
            "capability": cap.capability,
            "interval": interval,
            "aggregate": aggregate if interval else None,
            "data": data,
        }


def capability_state_dict(
    cap: DeviceCapability, latest: Any | None
) -> dict[str, Any]:
    value = (
        capability_values.from_reading_columns(
            cap.data_type, latest.value_numeric, latest.value_text, latest.value_json
        )
        if latest
        else None
    )
    return {
        "id": str(cap.id),
        "device_id": str(cap.device_id),
        "capability": cap.capability,
        "data_type": cap.data_type,
        "unit": cap.unit,
        "access": cap.access,
        "label": cap.label,
        "config": cap.config or {},
        "value": value,
        "reported_at": latest.recorded_at.isoformat() if latest else None,
    }


async def resolve_capability(
    session: AsyncSession, device_id: UUID, capability: str
) -> tuple[Device, DeviceCapability]:
    repo = DeviceRepository(session)
    device = await repo.by_id(device_id)
    if device is None:
        raise CapabilityError("device_not_found", "device not found")
    cap = await repo.capability(device_id, capability)
    if cap is None:
        raise CapabilityError("capability_not_found", "capability not found")
    return device, cap
