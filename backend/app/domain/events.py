"""In-process event bus.

MQTT ingest and scene execution publish domain events here; subscribers fan
them out (WebSocket broadcaster now, the n8n webhook dispatcher in Stage 5).
Deliberately condition-free: the bus carries raw events only — evaluating them
is n8n's job, never the backend's.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from uuid import UUID, uuid4

from app.utils.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class CapabilityStateEvent:
    device_id: UUID
    device_name: str
    room_slug: str | None
    capability: str
    value: Any
    previous_value: Any
    unit: str | None
    recorded_at: datetime
    event_id: UUID = field(default_factory=uuid4)
    event: str = "capability.state"


@dataclass(frozen=True)
class DeviceAvailabilityEvent:
    device_id: UUID
    device_name: str
    room_slug: str | None
    online: bool
    last_seen: datetime | None
    event_id: UUID = field(default_factory=uuid4)
    event: str = "device.availability"


@dataclass(frozen=True)
class SceneExecutedEvent:
    scene_id: UUID
    scene_slug: str
    actor_type: str
    executed_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    event_id: UUID = field(default_factory=uuid4)
    event: str = "scene.executed"


DomainEvent = CapabilityStateEvent | DeviceAvailabilityEvent | SceneExecutedEvent
Subscriber = Callable[[DomainEvent], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: list[Subscriber] = []

    def subscribe(self, handler: Subscriber) -> None:
        self._subscribers.append(handler)

    async def publish(self, event: DomainEvent) -> None:
        # Fan-out only; one failing subscriber never breaks the others or the
        # publisher. Subscribers must be quick (enqueue, don't process) so MQTT
        # ingest never stalls behind a slow consumer.
        for handler in self._subscribers:
            try:
                await handler(event)
            except Exception:
                log.exception("event_subscriber_failed", event=event.event)
