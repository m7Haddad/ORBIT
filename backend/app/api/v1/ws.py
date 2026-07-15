"""WebSocket push — the dashboard's live-state feed.

Clients connect to /ws/events?token=<access JWT> (browsers cannot set headers
on WebSocket upgrades). Every domain event (capability.state,
device.availability, scene.executed) is broadcast as JSON; the frontend's
optimistic UI reconciles against capability.state confirmations.
"""

import asyncio
import json
from dataclasses import asdict
from typing import Any
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.auth.tokens import TokenError, decode_token
from app.domain.events import DomainEvent
from app.utils.logging import get_logger

log = get_logger(__name__)

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def on_event(self, event: DomainEvent) -> None:
        """EventBus subscriber — serialise once, send to every client."""
        message = json.dumps({"type": event.event, **_jsonable(asdict(event))})
        async with self._lock:
            connections = list(self._connections)
        for websocket in connections:
            try:
                await websocket.send_text(message)
            except Exception:
                await self.disconnect(websocket)


def _jsonable(payload: dict[str, Any]) -> dict[str, Any]:
    def convert(value: Any) -> Any:
        if isinstance(value, UUID):
            return str(value)
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return value

    return {k: convert(v) for k, v in payload.items() if k != "event"}


@router.websocket("/ws/events")
async def events(websocket: WebSocket) -> None:
    settings = websocket.app.state.settings
    token = websocket.query_params.get("token", "")
    try:
        decode_token(settings, token)
    except TokenError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    manager: ConnectionManager = websocket.app.state.ws_manager
    await websocket.accept()
    await manager.connect(websocket)
    log.info("ws_connected", clients=len(manager._connections))
    try:
        while True:
            # Inbound messages are ignored (push-only feed); receiving keeps
            # disconnect detection working.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
