from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.deps import PrincipalDep, SessionDep, UserDep
from app.repositories.models import Room
from app.repositories.rooms import RoomRepository
from app.services.room_service import RoomService

router = APIRouter(prefix="/rooms", tags=["rooms"])


class RoomCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str | None = None
    icon: str | None = None
    sort_order: int = 0


class RoomUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    sort_order: int | None = None


def get_room_service(request: Request) -> RoomService:
    return request.app.state.room_service


RoomServiceDep = Annotated[RoomService, Depends(get_room_service)]


def _room_dict(room: Room, device_count: int | None = None) -> dict:
    payload = {
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
        "icon": room.icon,
        "sort_order": room.sort_order,
    }
    if device_count is not None:
        payload["device_count"] = device_count
    return payload


async def _get_or_404(session, room_id: UUID) -> Room:
    room = await RoomRepository(session).by_id(room_id)
    if room is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"code": "room_not_found", "message": "room not found"},
        )
    return room


@router.get("")
async def list_rooms(session: SessionDep, principal: PrincipalDep) -> dict:
    rows = await RoomRepository(session).list_with_device_counts()
    return {"data": [_room_dict(room, count) for room, count in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreate, session: SessionDep, principal: UserDep, service: RoomServiceDep
) -> dict:
    if body.slug and await RoomRepository(session).by_slug(body.slug):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "slug_taken", "message": f"slug {body.slug!r} exists"},
        )
    room = await service.create(
        session,
        principal=principal,
        name=body.name,
        slug=body.slug,
        icon=body.icon,
        sort_order=body.sort_order,
    )
    await session.commit()
    return _room_dict(room, 0)


@router.get("/{room_id}")
async def get_room(room_id: UUID, session: SessionDep, principal: PrincipalDep) -> dict:
    room = await _get_or_404(session, room_id)
    count = await RoomRepository(session).device_count(room_id)
    return _room_dict(room, count)


@router.patch("/{room_id}")
async def update_room(
    room_id: UUID,
    body: RoomUpdate,
    session: SessionDep,
    principal: UserDep,
    service: RoomServiceDep,
) -> dict:
    room = await _get_or_404(session, room_id)
    changes = body.model_dump(exclude_none=True)
    if changes:
        room = await service.update(
            session, principal=principal, room=room, changes=changes
        )
        await session.commit()
    count = await RoomRepository(session).device_count(room_id)
    return _room_dict(room, count)


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: UUID, session: SessionDep, principal: UserDep, service: RoomServiceDep
) -> None:
    room = await _get_or_404(session, room_id)
    await service.delete(session, principal=principal, room=room)
    await session.commit()
