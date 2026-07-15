"""Scenes — static macros. A scene is an ordered list of capability writes,
never a rule; deciding WHEN to execute one is n8n's job (or a human's).

Execution audits ONCE (scene.executed with the per-action result list); the
fan-out writes are not separately audited (audit-events.md — no double
counting). Audit + commit happen before the MQTT publishes so intent is always
recorded ahead of effect.
"""

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import capability_values
from app.domain.events import EventBus, SceneExecutedEvent
from app.domain.principal import Principal
from app.mqtt.client import MqttModule, MqttUnavailable
from app.repositories.models import Scene, SceneAction
from app.repositories.scenes import SceneRepository
from app.services.audit import AuditService
from app.utils.logging import get_logger
from app.utils.text import slugify

log = get_logger(__name__)


class SceneService:
    def __init__(self, mqtt: MqttModule, audit: AuditService, bus: EventBus) -> None:
        self._mqtt = mqtt
        self._audit = audit
        self._bus = bus

    async def create(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        name: str,
        icon: str | None,
        description: str | None,
        actions: list[dict[str, Any]],
    ) -> Scene:
        scene = Scene(
            name=name,
            slug=await self._unique_slug(session, name),
            icon=icon,
            description=description,
            created_by=principal.user_id,
        )
        for index, action in enumerate(actions):
            scene.actions.append(
                SceneAction(
                    device_capability_id=action["device_capability_id"],
                    payload=action["payload"],
                    sort_order=action.get("sort_order", index),
                )
            )
        SceneRepository(session).add(scene)
        await session.flush()
        await self._audit.record(
            session,
            principal=principal,
            action="scene.created",
            target_type="scene",
            target_id=scene.id,
            after=_scene_snapshot(scene),
        )
        return scene

    async def update(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        scene: Scene,
        changes: dict[str, Any],
        actions: list[dict[str, Any]] | None,
    ) -> Scene:
        before = _scene_snapshot(scene)
        for key, value in changes.items():
            setattr(scene, key, value)
        if actions is not None:
            # Replace-on-write per the API contract.
            scene.actions.clear()
            for index, action in enumerate(actions):
                scene.actions.append(
                    SceneAction(
                        device_capability_id=action["device_capability_id"],
                        payload=action["payload"],
                        sort_order=action.get("sort_order", index),
                    )
                )
        await session.flush()
        await self._audit.record(
            session,
            principal=principal,
            action="scene.updated",
            target_type="scene",
            target_id=scene.id,
            before=before,
            after=_scene_snapshot(scene),
        )
        return scene

    async def delete(
        self, session: AsyncSession, *, principal: Principal, scene: Scene
    ) -> None:
        await self._audit.record(
            session,
            principal=principal,
            action="scene.deleted",
            target_type="scene",
            target_id=scene.id,
            before=_scene_snapshot(scene),
        )
        await SceneRepository(session).delete(scene)

    async def execute(
        self, session: AsyncSession, *, principal: Principal, scene: Scene
    ) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        publishes: list[tuple[UUID, str, Any, UUID]] = []

        for action in scene.actions:
            cap = action.device_capability
            device = cap.device
            item = {
                "device_id": str(device.id),
                "capability": cap.capability,
                "status": "published",
            }
            if not device.is_online:
                item["status"] = "skipped_offline"
            else:
                try:
                    value = capability_values.validate_value(
                        cap.data_type, cap.config or {}, action.payload.get("value")
                    )
                    publishes.append((device.id, cap.capability, value, uuid4()))
                except capability_values.CapabilityValueError as exc:
                    log.warning(
                        "scene_action_invalid",
                        scene=scene.slug, cap=cap.capability, error=str(exc),
                    )
                    item["status"] = "error"
            results.append(item)

        entry = await self._audit.record(
            session,
            principal=principal,
            action="scene.executed",
            target_type="scene",
            target_id=scene.id,
            after={"results": results},
        )
        scene_id, scene_slug = scene.id, scene.slug
        await session.commit()

        for device_id, capability, value, request_id in publishes:
            try:
                await self._mqtt.publish_command(device_id, capability, value, request_id)
            except MqttUnavailable:
                log.error("scene_publish_failed", scene=scene_slug, cap=capability)

        await self._bus.publish(
            SceneExecutedEvent(
                scene_id=scene_id,
                scene_slug=scene_slug,
                actor_type=principal.actor_type.value,
            )
        )
        return {
            "scene_id": str(scene_id),
            "audit_id": str(entry.id),
            "results": results,
        }

    async def _unique_slug(self, session: AsyncSession, name: str) -> str:
        repo = SceneRepository(session)
        base = slugify(name)
        slug, n = base, 2
        while await repo.by_slug(slug) is not None:
            slug = f"{base}-{n}"
            n += 1
        return slug


def _scene_snapshot(scene: Scene) -> dict[str, Any]:
    return {
        "id": str(scene.id),
        "name": scene.name,
        "slug": scene.slug,
        "icon": scene.icon,
        "description": scene.description,
        "actions": [
            {
                "device_capability_id": str(a.device_capability_id),
                "payload": a.payload,
                "sort_order": a.sort_order,
            }
            for a in scene.actions
        ],
    }
