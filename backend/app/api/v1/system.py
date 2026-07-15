import asyncio

from fastapi import APIRouter

from app.api.deps import PrincipalDep
from app.services.system_service import system_metrics

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/metrics")
async def metrics(principal: PrincipalDep) -> dict:
    # psutil blocks briefly (cpu_percent sampling) — keep the event loop free.
    return await asyncio.to_thread(system_metrics)
