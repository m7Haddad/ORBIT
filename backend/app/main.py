"""ORBIT backend — FastAPI modular monolith entrypoint.

Lifespan wires the singletons: DB engine, event bus, MQTT module (ingest task),
WebSocket manager, and the service objects the routers pull from app.state.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import (
    ai_usage,
    audit,
    auth,
    capabilities,
    dashboard,
    devices,
    hermes,
    rooms,
    scenes,
    system,
    weather,
    ws,
)
from app.auth.rate_limit import SlidingWindowLimiter
from app.config import get_settings
from app.domain.events import EventBus
from app.integrations.mosquitto_dynsec import DynsecProvisioner
from app.integrations.weather import WeatherService
from app.mqtt.client import MqttModule
from app.repositories.db import build_engine, build_session_factory
from app.services.audit import AuditService
from app.services.auth_service import AuthService
from app.services.capability_service import CapabilityService
from app.services.device_service import DeviceService
from app.services.room_service import RoomService
from app.services.scene_service import SceneService
from app.utils.logging import configure_logging, get_logger

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)

    engine = build_engine(settings)
    session_factory = build_session_factory(engine)
    bus = EventBus()

    mqtt = MqttModule(settings, bus, session_factory)
    ws_manager = ws.ConnectionManager()
    bus.subscribe(ws_manager.on_event)

    audit_service = AuditService()
    provisioner = DynsecProvisioner(settings)

    app.state.settings = settings
    app.state.session_factory = session_factory
    app.state.event_bus = bus
    app.state.mqtt = mqtt
    app.state.ws_manager = ws_manager
    app.state.login_limiter = SlidingWindowLimiter(
        settings.login_rate_limit_attempts, settings.login_rate_limit_window_seconds
    )
    app.state.audit_service = audit_service
    app.state.auth_service = AuthService(settings, audit_service)
    app.state.room_service = RoomService(audit_service)
    app.state.device_service = DeviceService(provisioner, audit_service)
    app.state.capability_service = CapabilityService(mqtt, audit_service)
    app.state.scene_service = SceneService(mqtt, audit_service, bus)
    app.state.weather_service = WeatherService(settings)

    mqtt.start()
    log.info("backend_started", version=settings.version)
    try:
        yield
    finally:
        await mqtt.stop()
        await engine.dispose()
        log.info("backend_stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="ORBIT Backend", version=settings.version, lifespan=lifespan)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        # Contract error shape: {"error": {"code", "message"}}
        detail = exc.detail
        if not (isinstance(detail, dict) and "code" in detail):
            detail = {"code": "error", "message": str(detail)}
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": detail},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "request failed validation",
                    "details": {"errors": exc.errors()},
                }
            },
        )

    @app.get("/api/v1/health")
    def health() -> dict:
        return {
            "status": "ok",
            "service": settings.app_name,
            "version": settings.version,
            "mqtt_connected": getattr(app.state, "mqtt", None) is not None
            and app.state.mqtt.connected,
            "time": datetime.now(timezone.utc).isoformat(),
        }

    for router in (
        auth.router,
        rooms.router,
        devices.router,
        capabilities.router,
        scenes.router,
        audit.router,
        system.router,
        weather.router,
        ai_usage.router,
        hermes.router,
        dashboard.router,
    ):
        app.include_router(router, prefix="/api/v1")
    app.include_router(ws.router)

    return app


app = create_app()
