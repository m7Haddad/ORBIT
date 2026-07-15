from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.deps import PrincipalDep, SessionDep, UserDep
from app.repositories.devices import DeviceRepository
from app.repositories.models import Scene
from app.repositories.scenes import SceneRepository
from app.services.scene_service import SceneService

router = APIRouter(prefix="/scenes", tags=["scenes"])


class SceneActionBody(BaseModel):
    device_id: UUID
    capability: str
    payload: dict[str, Any]
    sort_order: int | None = None


class SceneCreate(BaseModel):
    name: str = Field(min_length=1)
    icon: str | None = None
    description: str | None = None
    actions: list[SceneActionBody] = Field(min_length=1)


class SceneUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    description: str | None = None
    actions: list[SceneActionBody] | None = None


def get_scene_service(request: Request) -> SceneService:
    return request.app.state.scene_service


SceneServiceDep = Annotated[SceneService, Depends(get_scene_service)]


def _scene_dict(scene: Scene) -> dict:
    return {
        "id": str(scene.id),
        "name": scene.name,
        "slug": scene.slug,
        "icon": scene.icon,
        "description": scene.description,
        "actions": [
            {
                "device_id": str(a.device_capability.device_id),
                "capability": a.device_capability.capability,
                "payload": a.payload,
                "sort_order": a.sort_order,
            }
            for a in scene.actions
        ],
    }


async def _get_or_404(session, scene_id: UUID) -> Scene:
    scene = await SceneRepository(session).by_id(scene_id)
    if scene is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"code": "scene_not_found", "message": "scene not found"},
        )
    return scene


async def _resolve_actions(
    session, actions: list[SceneActionBody]
) -> list[dict[str, Any]]:
    """API actions reference (device_id, capability); storage references
    device_capabilities.id. Also rejects actions on read-only capabilities."""
    repo = DeviceRepository(session)
    resolved = []
    for index, action in enumerate(actions):
        cap = await repo.capability(action.device_id, action.capability)
        if cap is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "unknown_capability",
                    "message": f"{action.device_id}/{action.capability} does not exist",
                },
            )
        if cap.access not in ("write", "read_write"):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "not_writable",
                    "message": f"{action.capability} is read-only",
                },
            )
        resolved.append(
            {
                "device_capability_id": cap.id,
                "payload": action.payload,
                "sort_order": action.sort_order if action.sort_order is not None else index,
            }
        )
    return resolved


@router.get("")
async def list_scenes(session: SessionDep, principal: PrincipalDep) -> dict:
    scenes = await SceneRepository(session).list()
    return {"data": [_scene_dict(s) for s in scenes]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_scene(
    body: SceneCreate, session: SessionDep, principal: UserDep, service: SceneServiceDep
) -> dict:
    actions = await _resolve_actions(session, body.actions)
    scene = await service.create(
        session,
        principal=principal,
        name=body.name,
        icon=body.icon,
        description=body.description,
        actions=actions,
    )
    await session.commit()
    # Reload the actions collection (and its joined capabilities) — the
    # manually-appended instances can't lazy-load under an async session.
    await session.refresh(scene, ["actions"])
    return _scene_dict(scene)


@router.get("/{scene_id}")
async def get_scene(scene_id: UUID, session: SessionDep, principal: PrincipalDep) -> dict:
    return _scene_dict(await _get_or_404(session, scene_id))


@router.patch("/{scene_id}")
async def update_scene(
    scene_id: UUID,
    body: SceneUpdate,
    session: SessionDep,
    principal: UserDep,
    service: SceneServiceDep,
) -> dict:
    scene = await _get_or_404(session, scene_id)
    changes = body.model_dump(exclude_none=True, exclude={"actions"})
    actions = (
        await _resolve_actions(session, body.actions) if body.actions is not None else None
    )
    scene = await service.update(
        session, principal=principal, scene=scene, changes=changes, actions=actions
    )
    await session.commit()
    await session.refresh(scene, ["actions"])
    return _scene_dict(scene)


@router.delete("/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scene(
    scene_id: UUID, session: SessionDep, principal: UserDep, service: SceneServiceDep
) -> None:
    scene = await _get_or_404(session, scene_id)
    await service.delete(session, principal=principal, scene=scene)
    await session.commit()


@router.post("/{scene_id}/execute", status_code=status.HTTP_202_ACCEPTED)
async def execute_scene(
    scene_id: UUID,
    session: SessionDep,
    principal: PrincipalDep,
    service: SceneServiceDep,
) -> dict:
    scene = await _get_or_404(session, scene_id)
    return await service.execute(session, principal=principal, scene=scene)
