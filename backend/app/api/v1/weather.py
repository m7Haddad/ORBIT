from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.deps import PrincipalDep
from app.integrations.weather import WeatherService, WeatherUnavailable

router = APIRouter(prefix="/weather", tags=["weather"])


def get_weather_service(request: Request) -> WeatherService:
    return request.app.state.weather_service


@router.get("")
async def weather(
    principal: PrincipalDep,
    service: Annotated[WeatherService, Depends(get_weather_service)],
    location: str | None = None,
) -> dict:
    # Single configured home location for now; `location` is accepted for
    # contract compatibility and future multi-location config.
    try:
        return await service.snapshot()
    except WeatherUnavailable as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"code": "weather_unavailable", "message": str(exc)},
        )
