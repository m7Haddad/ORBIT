"""Open-Meteo weather client (keyless) with an in-memory TTL cache.

The frontend, Hermes, and n8n all read weather through the backend's /weather
passthrough — nothing else ever calls the provider (api-contract.yaml).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import Settings
from app.utils.logging import get_logger

log = get_logger(__name__)

# WMO weather interpretation codes → ORBIT condition slugs.
_WMO: dict[range, str] = {
    range(0, 1): "clear",
    range(1, 3): "partly_cloudy",
    range(3, 4): "overcast",
    range(45, 49): "fog",
    range(51, 58): "drizzle",
    range(61, 68): "rain",
    range(71, 78): "snow",
    range(80, 83): "rain_showers",
    range(85, 87): "snow_showers",
    range(95, 100): "thunderstorm",
}


def _condition(code: int | None) -> str:
    if code is None:
        return "unknown"
    for span, slug in _WMO.items():
        if code in span:
            return slug
    return "unknown"


class WeatherUnavailable(Exception):
    """Upstream failed and no valid cache exists → 502."""


@dataclass
class _CacheEntry:
    payload: dict[str, Any]
    expires_at: datetime


class WeatherService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._cache: _CacheEntry | None = None

    async def snapshot(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        if self._cache and self._cache.expires_at > now:
            return self._cache.payload
        try:
            payload = await self._fetch(now)
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            if self._cache:
                # Serve stale rather than fail — cache_expires_at exposes staleness.
                log.warning("weather_upstream_failed_serving_stale", error=str(exc))
                return self._cache.payload
            raise WeatherUnavailable(str(exc)) from exc
        self._cache = _CacheEntry(
            payload=payload,
            expires_at=now + timedelta(seconds=self._settings.weather_cache_ttl_seconds),
        )
        return payload

    async def _fetch(self, now: datetime) -> dict[str, Any]:
        params = {
            "latitude": self._settings.weather_latitude,
            "longitude": self._settings.weather_longitude,
            "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
            "daily": "temperature_2m_min,temperature_2m_max,weather_code",
            "forecast_days": 5,
            "timezone": "UTC",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://api.open-meteo.com/v1/forecast", params=params
            )
            response.raise_for_status()
            data = response.json()

        current = data["current"]
        daily = data["daily"]
        return {
            "location": self._settings.weather_location_name,
            "current": {
                "temperature_c": current["temperature_2m"],
                "humidity_percent": current["relative_humidity_2m"],
                "condition": _condition(current.get("weather_code")),
                "wind_kph": current["wind_speed_10m"],
            },
            "forecast": [
                {
                    "date": daily["time"][i],
                    "min_c": daily["temperature_2m_min"][i],
                    "max_c": daily["temperature_2m_max"][i],
                    "condition": _condition(daily["weather_code"][i]),
                }
                for i in range(len(daily["time"]))
            ],
            "fetched_at": now.isoformat(),
            "cache_expires_at": (
                now + timedelta(seconds=self._settings.weather_cache_ttl_seconds)
            ).isoformat(),
        }
