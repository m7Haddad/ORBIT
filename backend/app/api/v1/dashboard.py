"""Per-user dashboard layout persistence (widget-contract.md §2).

Pure UI state: not audited (only device/scene/room state changes are actor
actions per audit-events.md — a layout rearrangement changes nothing in the
home). PUT replaces the caller's whole layout atomically, matching the grid's
save-on-edit-exit behaviour.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.api.deps import SessionDep, UserDep
from app.repositories.models import DashboardWidget

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

SIZES = {"1x1", "2x1", "2x2", "4x2"}
SOURCE_KINDS = {"device", "weather", "system", "hermes", "scene"}


class WidgetIn(BaseModel):
    widget_type: str = Field(min_length=1)
    source: dict[str, Any]
    size: str
    position: int = Field(ge=0)
    title_override: str | None = None


class LayoutPut(BaseModel):
    widgets: list[WidgetIn]


def _widget_dict(w: DashboardWidget) -> dict:
    return {
        "id": str(w.id),
        "widget_type": w.widget_type,
        "source": w.source,
        "size": w.size,
        "position": w.position,
        "title_override": w.title_override,
    }


@router.get("/layout")
async def get_layout(session: SessionDep, principal: UserDep) -> dict:
    rows = await session.scalars(
        select(DashboardWidget)
        .where(DashboardWidget.user_id == principal.user_id)
        .order_by(DashboardWidget.position)
    )
    return {"data": [_widget_dict(w) for w in rows]}


@router.put("/layout")
async def put_layout(
    body: LayoutPut, session: SessionDep, principal: UserDep
) -> dict:
    for widget in body.widgets:
        if widget.size not in SIZES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "invalid_size", "message": f"size must be one of {sorted(SIZES)}"},
            )
        if widget.source.get("kind") not in SOURCE_KINDS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "invalid_source", "message": f"source.kind must be one of {sorted(SOURCE_KINDS)}"},
            )

    await session.execute(
        delete(DashboardWidget).where(DashboardWidget.user_id == principal.user_id)
    )
    created: list[DashboardWidget] = []
    for widget in body.widgets:
        row = DashboardWidget(
            user_id=principal.user_id,
            widget_type=widget.widget_type,
            source=widget.source,
            size=widget.size,
            position=widget.position,
            title_override=widget.title_override,
        )
        session.add(row)
        created.append(row)
    await session.commit()
    for row in created:
        await session.refresh(row)
    return {"data": [_widget_dict(w) for w in created]}
