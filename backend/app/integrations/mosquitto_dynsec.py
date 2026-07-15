"""Per-device broker credential provisioning via Mosquitto dynamic security.

Speaks $CONTROL/dynamic-security/v1 as the dynsec admin. Each registered device
gets a client `dev-{device_id}` (client id = username) and a role granting
exactly its own topic subtree (docs/specs/mqtt-topics.md §5). Connections are
short-lived per operation — provisioning happens only at manual device
registration/deletion, so simplicity beats pooling.
"""

import asyncio
import json
from typing import Any
from uuid import UUID

import aiomqtt

from app.config import Settings
from app.utils.logging import get_logger

log = get_logger(__name__)

CONTROL_TOPIC = "$CONTROL/dynamic-security/v1"
RESPONSE_TOPIC = f"{CONTROL_TOPIC}/response"
# Errors that mean "already in the desired state" for cleanup/idempotency.
_IGNORABLE = ("already exists", "not found")


class ProvisioningError(Exception):
    pass


class DynsecProvisioner:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def provision_device(self, device_id: UUID, password: str) -> str:
        """Create role + client for a device; returns the mqtt username."""
        username = f"dev-{device_id}"
        rolename = f"role-{username}"
        prefix = self._settings.mqtt_topic_prefix
        acls = [
            {"acltype": "publishClientSend",
             "topic": f"{prefix}/devices/{device_id}/+/state", "allow": True, "priority": 1},
            {"acltype": "publishClientSend",
             "topic": f"{prefix}/devices/{device_id}/availability", "allow": True, "priority": 1},
            {"acltype": "subscribePattern",
             "topic": f"{prefix}/devices/{device_id}/+/set", "allow": True, "priority": 1},
            {"acltype": "publishClientReceive",
             "topic": f"{prefix}/devices/{device_id}/+/set", "allow": True, "priority": 1},
        ]
        await self._send(
            [
                {"command": "createRole", "rolename": rolename, "acls": acls},
                {
                    "command": "createClient",
                    "username": username,
                    "password": password,
                    "clientid": username,
                    "roles": [{"rolename": rolename}],
                },
            ]
        )
        log.info("device_provisioned", username=username)
        return username

    async def revoke_device(self, device_id: UUID) -> None:
        """Delete the device's client + role. deleteClient also disconnects any
        live session, so revocation is immediate."""
        username = f"dev-{device_id}"
        await self._send(
            [
                {"command": "deleteClient", "username": username},
                {"command": "deleteRole", "rolename": f"role-{username}"},
            ],
            ignore_missing=True,
        )
        log.info("device_revoked", username=username)

    async def _send(
        self, commands: list[dict[str, Any]], *, ignore_missing: bool = False
    ) -> None:
        try:
            async with aiomqtt.Client(
                hostname=self._settings.mqtt_host,
                port=self._settings.mqtt_port,
                username=self._settings.mqtt_dynsec_admin_user,
                password=self._settings.mqtt_dynsec_admin_password,
            ) as client:
                await client.subscribe(RESPONSE_TOPIC, qos=1)
                await client.publish(
                    CONTROL_TOPIC, json.dumps({"commands": commands}), qos=1
                )
                responses = await asyncio.wait_for(
                    self._collect(client, len(commands)), timeout=5
                )
        except (aiomqtt.MqttError, asyncio.TimeoutError) as exc:
            raise ProvisioningError(f"dynsec unreachable: {exc}") from exc

        for response in responses:
            error = response.get("error")
            if error and not (
                ignore_missing and any(frag in error.lower() for frag in _IGNORABLE)
            ):
                raise ProvisioningError(
                    f"{response.get('command')}: {error}"
                )

    async def _collect(
        self, client: aiomqtt.Client, expected: int
    ) -> list[dict[str, Any]]:
        collected: list[dict[str, Any]] = []
        async for message in client.messages:
            payload = message.payload if isinstance(message.payload, bytes) else b"{}"
            body = json.loads(payload)
            collected.extend(body.get("responses", []))
            if len(collected) >= expected:
                return collected
        return collected
