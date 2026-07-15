"""Configuration module.

Single home for every environment-dependent value (CLAUDE.md: configuration over
hardcoding). All other modules read from Settings; nothing reads os.environ
directly.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "orbit-backend"
    version: str = "0.2.0"
    log_level: str = "INFO"

    database_url: str = ""

    # MQTT
    mqtt_host: str = "mosquitto"
    mqtt_port: int = 1883
    mqtt_topic_prefix: str = "orbit"
    mqtt_backend_user: str = "orbit-backend"
    mqtt_backend_password: str = ""
    # Dynsec admin — used only by the Integrations provisioner to create/revoke
    # per-device broker credentials over $CONTROL/dynamic-security/v1.
    mqtt_dynsec_admin_user: str = "orbit-dynsec-admin"
    mqtt_dynsec_admin_password: str = ""

    # Auth
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "orbit"
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_days: int = 30
    service_token_ttl_days: int = 365
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 300

    # Weather (Open-Meteo)
    weather_latitude: float = 0.0
    weather_longitude: float = 0.0
    weather_location_name: str = "home"
    weather_cache_ttl_seconds: int = 900

    # MQTT ingest: device timestamps further than this from server time are
    # replaced with receive time ("absent or obviously wrong", mqtt-topics.md §1)
    ingest_ts_max_skew_seconds: int = 3600

    # Bootstrap admin for scripts/seed.py — consumed only there.
    orbit_admin_email: str = ""
    orbit_admin_password: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
