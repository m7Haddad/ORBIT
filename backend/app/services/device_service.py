"""Device lifecycle — manual registration only (CLAUDE.md constraint #4).

Registration generates the device's one-time MQTT credentials and provisions
them on the broker (dynsec) before commit; deletion revokes them (which also
disconnects a live device). All lifecycle actions are user-only and audited.
"""

import secrets
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.principal import Principal
from app.integrations.mosquitto_dynsec import DynsecProvisioner, ProvisioningError
from app.repositories.devices import DeviceRepository
from app.repositories.models import Device, DeviceCapability
from app.services.audit import AuditService
from app.utils.logging import get_logger

log = get_logger(__name__)


class DeviceService:
    def __init__(self, provisioner: DynsecProvisioner, audit: AuditService) -> None:
        self._provisioner = provisioner
        self._audit = audit

    async def register(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        name: str,
        type_: str,
        room_id: UUID | None,
        firmware_version: str | None,
        capabilities: list[dict[str, Any]],
    ) -> tuple[Device, dict[str, str]]:
        repo = DeviceRepository(session)
        device = Device(
            name=name,
            type=type_,
            room_id=room_id,
            firmware_version=firmware_version,
            mqtt_username="pending",  # real value needs the generated id
        )
        repo.add(device)
        await session.flush()
        device.mqtt_username = f"dev-{device.id}"

        for cap in capabilities:
            session.add(DeviceCapability(device_id=device.id, **cap))
        await session.flush()

        # Broker credentials: random secret, stored hashed broker-side only —
        # returned exactly once in the registration response.
        password = secrets.token_urlsafe(32)
        await self._provisioner.provision_device(device.id, password)
        try:
            await self._audit.record(
                session,
                principal=principal,
                action="device.registered",
                target_type="device",
                target_id=device.id,
                after=_device_snapshot(device, capabilities),
            )
        except Exception:
            # Keep broker and DB consistent if the transaction can't complete.
            await self._provisioner.revoke_device(device.id)
            raise

        credentials = {
            "username": device.mqtt_username,
            "password": password,
            "state_topic_prefix": f"orbit/devices/{device.id}/",
        }
        return device, credentials

    async def update(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        device: Device,
        changes: dict[str, Any],
    ) -> Device:
        before = {k: _jsonable(getattr(device, "type" if k == "type" else k)) for k in changes}
        for key, value in changes.items():
            setattr(device, "type" if key == "type" else key, value)
        await session.flush()
        await self._audit.record(
            session,
            principal=principal,
            action="device.updated",
            target_type="device",
            target_id=device.id,
            before=before,
            after={k: _jsonable(v) for k, v in changes.items()},
        )
        return device

    async def delete(
        self, session: AsyncSession, *, principal: Principal, device: Device
    ) -> None:
        snapshot = _device_snapshot(
            device,
            [
                {
                    "capability": c.capability,
                    "data_type": c.data_type,
                    "access": c.access,
                    "label": c.label,
                }
                for c in device.capabilities
            ],
        )
        # Revoke broker access first — a deleted device must not stay connected.
        try:
            await self._provisioner.revoke_device(device.id)
        except ProvisioningError:
            log.error("revoke_failed_aborting_delete", device_id=str(device.id))
            raise
        await self._audit.record(
            session,
            principal=principal,
            action="device.deleted",
            target_type="device",
            target_id=device.id,
            before=snapshot,
        )
        await DeviceRepository(session).delete(device)

    async def declare_capability(
        self,
        session: AsyncSession,
        *,
        principal: Principal,
        device: Device,
        definition: dict[str, Any],
    ) -> DeviceCapability:
        capability = DeviceCapability(device_id=device.id, **definition)
        session.add(capability)
        await session.flush()
        await self._audit.record(
            session,
            principal=principal,
            action="device.capability.declared",
            target_type="capability",
            target_id=capability.id,
            after=definition,
        )
        return capability


def _device_snapshot(device: Device, capabilities: list[dict[str, Any]]) -> dict:
    # MQTT password is never logged — mqtt_username only (audit-events.md).
    return {
        "id": str(device.id),
        "name": device.name,
        "type": device.type,
        "room_id": str(device.room_id) if device.room_id else None,
        "firmware_version": device.firmware_version,
        "mqtt_username": device.mqtt_username,
        "capabilities": capabilities,
    }


def _jsonable(value: Any) -> Any:
    return str(value) if isinstance(value, UUID) else value
