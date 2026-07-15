from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.deps import PrincipalDep, SessionDep, UserDep
from app.integrations.mosquitto_dynsec import ProvisioningError
from app.repositories.devices import DeviceRepository
from app.repositories.models import Device
from app.repositories.readings import ReadingRepository
from app.services.capability_service import capability_state_dict
from app.services.device_service import DeviceService

router = APIRouter(prefix="/devices", tags=["devices"])

DATA_TYPES = {"float", "int", "bool", "string", "enum", "json"}
ACCESS_MODES = {"read", "write", "read_write"}


class CapabilityCreate(BaseModel):
    capability: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    data_type: str
    unit: str | None = None
    access: str
    label: str
    config: dict[str, Any] = {}


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1)
    type: str = Field(min_length=1)
    room_id: UUID | None = None
    firmware_version: str | None = None
    capabilities: list[CapabilityCreate] = []


class DeviceUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    room_id: UUID | None = None
    firmware_version: str | None = None


def get_device_service(request: Request) -> DeviceService:
    return request.app.state.device_service


DeviceServiceDep = Annotated[DeviceService, Depends(get_device_service)]


def _device_dict(device: Device) -> dict:
    return {
        "id": str(device.id),
        "room_id": str(device.room_id) if device.room_id else None,
        "name": device.name,
        "type": device.type,
        "firmware_version": device.firmware_version,
        "is_online": device.is_online,
        "last_seen": device.last_seen.isoformat() if device.last_seen else None,
        "created_at": device.created_at.isoformat(),
        "updated_at": device.updated_at.isoformat(),
    }


async def _device_detail(session, device: Device) -> dict:
    readings = ReadingRepository(session)
    latest = await readings.latest_many([c.id for c in device.capabilities])
    payload = _device_dict(device)
    payload["capabilities"] = [
        capability_state_dict(cap, latest.get(cap.id)) for cap in device.capabilities
    ]
    return payload


async def _get_or_404(session, device_id: UUID) -> Device:
    device = await DeviceRepository(session).by_id(device_id)
    if device is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"code": "device_not_found", "message": "device not found"},
        )
    return device


def _validate_capability(cap: CapabilityCreate) -> dict:
    if cap.data_type not in DATA_TYPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_data_type", "message": f"data_type must be one of {sorted(DATA_TYPES)}"},
        )
    if cap.access not in ACCESS_MODES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_access", "message": f"access must be one of {sorted(ACCESS_MODES)}"},
        )
    return cap.model_dump()


@router.get("")
async def list_devices(
    session: SessionDep,
    principal: PrincipalDep,
    room_id: UUID | None = None,
    type: str | None = None,
    online: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    devices, total = await DeviceRepository(session).list(
        room_id=room_id, type_=type, online=online,
        limit=min(limit, 500), offset=offset,
    )
    return {
        "data": [_device_dict(d) for d in devices],
        "meta": {"total": total, "limit": limit, "offset": offset},
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_device(
    body: DeviceCreate,
    session: SessionDep,
    principal: UserDep,
    service: DeviceServiceDep,
) -> dict:
    capabilities = [_validate_capability(cap) for cap in body.capabilities]
    try:
        device, credentials = await service.register(
            session,
            principal=principal,
            name=body.name,
            type_=body.type,
            room_id=body.room_id,
            firmware_version=body.firmware_version,
            capabilities=capabilities,
        )
        await session.commit()
    except ProvisioningError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"code": "broker_provisioning_failed", "message": str(exc)},
        )
    # Freshly-created instance: load the capabilities collection explicitly —
    # async sessions cannot lazy-load on attribute access.
    await session.refresh(device, ["capabilities"])
    payload = await _device_detail(session, device)
    payload["mqtt_credentials"] = credentials
    return payload


@router.get("/{device_id}")
async def get_device(
    device_id: UUID, session: SessionDep, principal: PrincipalDep
) -> dict:
    device = await _get_or_404(session, device_id)
    return await _device_detail(session, device)


@router.patch("/{device_id}")
async def update_device(
    device_id: UUID,
    body: DeviceUpdate,
    session: SessionDep,
    principal: UserDep,
    service: DeviceServiceDep,
) -> dict:
    device = await _get_or_404(session, device_id)
    changes = body.model_dump(exclude_none=True)
    if changes:
        device = await service.update(
            session, principal=principal, device=device, changes=changes
        )
        await session.commit()
    return _device_dict(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: UUID,
    session: SessionDep,
    principal: UserDep,
    service: DeviceServiceDep,
) -> None:
    device = await _get_or_404(session, device_id)
    try:
        await service.delete(session, principal=principal, device=device)
    except ProvisioningError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"code": "broker_revocation_failed", "message": str(exc)},
        )
    await session.commit()


@router.get("/{device_id}/capabilities")
async def list_capabilities(
    device_id: UUID, session: SessionDep, principal: PrincipalDep
) -> dict:
    device = await _get_or_404(session, device_id)
    detail = await _device_detail(session, device)
    return {"data": detail["capabilities"]}


@router.post("/{device_id}/capabilities", status_code=status.HTTP_201_CREATED)
async def declare_capability(
    device_id: UUID,
    body: CapabilityCreate,
    session: SessionDep,
    principal: UserDep,
    service: DeviceServiceDep,
) -> dict:
    device = await _get_or_404(session, device_id)
    if any(c.capability == body.capability for c in device.capabilities):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "capability_exists", "message": f"{body.capability} already declared"},
        )
    capability = await service.declare_capability(
        session, principal=principal, device=device, definition=_validate_capability(body)
    )
    await session.commit()
    return capability_state_dict(capability, None)
