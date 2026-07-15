from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.api.deps import PrincipalDep, SessionDep
from app.mqtt.client import MqttUnavailable
from app.services.capability_service import (
    CapabilityError,
    CapabilityService,
    resolve_capability,
)

router = APIRouter(prefix="/devices/{device_id}/capabilities", tags=["capabilities"])

_ERROR_STATUS = {
    "device_not_found": status.HTTP_404_NOT_FOUND,
    "capability_not_found": status.HTTP_404_NOT_FOUND,
    "not_writable": status.HTTP_403_FORBIDDEN,
    "device_offline": status.HTTP_409_CONFLICT,
    "invalid_value": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "invalid_interval": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "invalid_aggregate": status.HTTP_422_UNPROCESSABLE_ENTITY,
}


class CommandRequest(BaseModel):
    value: Any


def get_capability_service(request: Request) -> CapabilityService:
    return request.app.state.capability_service


CapServiceDep = Annotated[CapabilityService, Depends(get_capability_service)]


def _http_error(exc: CapabilityError) -> HTTPException:
    return HTTPException(
        _ERROR_STATUS.get(exc.code, status.HTTP_400_BAD_REQUEST),
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/{capability}")
async def read_capability(
    device_id: UUID,
    capability: str,
    session: SessionDep,
    principal: PrincipalDep,
    service: CapServiceDep,
) -> dict:
    try:
        _, cap = await resolve_capability(session, device_id, capability)
    except CapabilityError as exc:
        raise _http_error(exc)
    return await service.state(session, cap)


@router.post("/{capability}", status_code=status.HTTP_202_ACCEPTED)
async def write_capability(
    device_id: UUID,
    capability: str,
    body: CommandRequest,
    session: SessionDep,
    principal: PrincipalDep,
    service: CapServiceDep,
) -> dict:
    try:
        device, cap = await resolve_capability(session, device_id, capability)
        return await service.command(
            session, principal=principal, device=device, cap=cap, value=body.value
        )
    except CapabilityError as exc:
        raise _http_error(exc)
    except MqttUnavailable:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "mqtt_unavailable", "message": "broker connection down"},
        )


@router.get("/{capability}/readings")
async def read_history(
    device_id: UUID,
    capability: str,
    session: SessionDep,
    principal: PrincipalDep,
    service: CapServiceDep,
    from_: Annotated[datetime, Query(alias="from")],
    to: datetime | None = None,
    interval: str | None = None,
    aggregate: Annotated[str, Query(pattern="^(avg|min|max|last)$")] = "avg",
    limit: Annotated[int, Query(ge=1, le=10000)] = 1000,
) -> dict:
    try:
        _, cap = await resolve_capability(session, device_id, capability)
        return await service.readings(
            session,
            cap,
            from_=from_,
            to=to,
            interval=interval,
            aggregate=aggregate,
            limit=limit,
        )
    except CapabilityError as exc:
        raise _http_error(exc)
