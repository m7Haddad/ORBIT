"""MQTT module.

Exactly two subscriptions ({prefix}/devices/+/+/state and
{prefix}/devices/+/availability, per mqtt-topics.md §4) and one publish
direction ({prefix}/devices/{id}/{capability}/set). Incoming state is telemetry:
persisted to capability_readings and fanned out on the event bus — never
evaluated. No conditional/automation logic lives here or anywhere backend-side.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import aiomqtt
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.domain import capability_values
from app.domain.events import (
    CapabilityStateEvent,
    DeviceAvailabilityEvent,
    EventBus,
)
from app.repositories.devices import DeviceRepository
from app.repositories.readings import ReadingRepository
from app.utils.logging import get_logger

log = get_logger(__name__)


class MqttUnavailable(Exception):
    """Broker connection is down — capability writes cannot be published."""


class MqttModule:
    def __init__(
        self,
        settings: Settings,
        bus: EventBus,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._settings = settings
        self._bus = bus
        self._session_factory = session_factory
        self._client: aiomqtt.Client | None = None
        self._task: asyncio.Task | None = None

    # ------------------------------------------------------------ lifecycle --
    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="mqtt-module")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._client = None

    @property
    def connected(self) -> bool:
        return self._client is not None

    async def _run(self) -> None:
        prefix = self._settings.mqtt_topic_prefix
        backoff = 1
        while True:
            try:
                async with aiomqtt.Client(
                    hostname=self._settings.mqtt_host,
                    port=self._settings.mqtt_port,
                    username=self._settings.mqtt_backend_user,
                    password=self._settings.mqtt_backend_password,
                    identifier=self._settings.mqtt_backend_user,
                ) as client:
                    self._client = client
                    backoff = 1
                    await client.subscribe(f"{prefix}/devices/+/+/state", qos=1)
                    await client.subscribe(f"{prefix}/devices/+/availability", qos=1)
                    log.info("mqtt_connected", host=self._settings.mqtt_host)
                    async for message in client.messages:
                        try:
                            await self._dispatch(message)
                        except Exception:
                            log.exception(
                                "mqtt_message_failed", topic=str(message.topic)
                            )
            except asyncio.CancelledError:
                raise
            except aiomqtt.MqttError as exc:
                self._client = None
                log.warning("mqtt_disconnected", error=str(exc), retry_in=backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    # ------------------------------------------------------------- publish ---
    async def publish_command(
        self, device_id: UUID, capability: str, value: Any, request_id: UUID
    ) -> str:
        if self._client is None:
            raise MqttUnavailable("MQTT connection is down")
        topic = (
            f"{self._settings.mqtt_topic_prefix}/devices/{device_id}/{capability}/set"
        )
        payload = json.dumps({"value": value, "request_id": str(request_id)})
        # QoS 1, never retained — commands must not replay to rebooting devices.
        await self._client.publish(topic, payload, qos=1, retain=False)
        return topic

    # -------------------------------------------------------------- ingest ---
    async def _dispatch(self, message: aiomqtt.Message) -> None:
        parts = str(message.topic).split("/")
        payload = message.payload if isinstance(message.payload, bytes) else b""
        # {prefix}/devices/{id}/availability
        if len(parts) == 4 and parts[3] == "availability":
            await self._ingest_availability(parts[2], payload)
        # {prefix}/devices/{id}/{capability}/state
        elif len(parts) == 5 and parts[4] == "state":
            await self._ingest_state(parts[2], parts[3], payload)

    async def _ingest_state(
        self, device_segment: str, capability: str, payload: bytes
    ) -> None:
        device_id = _parse_uuid(device_segment)
        if device_id is None:
            log.warning("state_bad_device_id", segment=device_segment)
            return
        try:
            body = json.loads(payload)
            raw_value = body["value"]
        except (json.JSONDecodeError, TypeError, KeyError):
            log.warning("state_bad_payload", device=device_segment, cap=capability)
            return

        async with self._session_factory() as session:
            devices = DeviceRepository(session)
            cap = await devices.capability(device_id, capability)
            if cap is None:
                log.warning(
                    "state_unknown_capability", device=device_segment, cap=capability
                )
                return
            try:
                value = capability_values.validate_value(
                    cap.data_type, cap.config or {}, raw_value
                )
            except capability_values.CapabilityValueError as exc:
                log.warning(
                    "state_invalid_value",
                    device=device_segment, cap=capability, error=str(exc),
                )
                return

            recorded_at = self._sane_timestamp(body.get("ts"))
            readings = ReadingRepository(session)
            previous = await readings.latest(cap.id)
            previous_value = (
                capability_values.from_reading_columns(
                    cap.data_type,
                    previous.value_numeric,
                    previous.value_text,
                    previous.value_json,
                )
                if previous
                else None
            )
            readings.add(
                device_capability_id=cap.id,
                columns=capability_values.to_reading_columns(cap.data_type, value),
                recorded_at=recorded_at,
            )
            device = await devices.by_id(device_id)
            await session.commit()

        await self._bus.publish(
            CapabilityStateEvent(
                device_id=device_id,
                device_name=device.name if device else "",
                room_slug=device.room.slug if device and device.room else None,
                capability=capability,
                value=value,
                previous_value=previous_value,
                unit=cap.unit,
                recorded_at=recorded_at,
            )
        )

    async def _ingest_availability(self, device_segment: str, payload: bytes) -> None:
        device_id = _parse_uuid(device_segment)
        if device_id is None:
            return
        status = payload.decode(errors="replace").strip().lower()
        if status not in ("online", "offline"):
            log.warning("availability_bad_payload", device=device_segment, payload=status)
            return
        online = status == "online"
        now = datetime.now(timezone.utc)

        async with self._session_factory() as session:
            devices = DeviceRepository(session)
            device = await devices.by_id(device_id)
            if device is None:
                log.warning("availability_unknown_device", device=device_segment)
                return
            changed = await devices.set_availability(
                device_id, online=online, last_seen=now
            )
            await session.commit()

        # Transitions only — retained `online` replayed on our reconnect is a
        # level, not an edge, and must not spam subscribers.
        if changed:
            await self._bus.publish(
                DeviceAvailabilityEvent(
                    device_id=device_id,
                    device_name=device.name,
                    room_slug=device.room.slug if device.room else None,
                    online=online,
                    last_seen=now,
                )
            )

    def _sane_timestamp(self, ts: Any) -> datetime:
        """Device time when plausible, receive time otherwise (mqtt-topics.md §1)."""
        now = datetime.now(timezone.utc)
        if not isinstance(ts, str):
            return now
        try:
            parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            return now
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        skew = abs((parsed - now).total_seconds())
        return parsed if skew <= self._settings.ingest_ts_max_skew_seconds else now


def _parse_uuid(value: str) -> UUID | None:
    try:
        return UUID(value)
    except ValueError:
        return None
