#!/usr/bin/env bash
# Bootstrap Mosquitto dynamic security from .env credentials.
# Creates (idempotently):
#   - the dynsec store (dynamic-security.json on the mosquitto data volume)
#     with the dynsec admin account
#   - the orbit-backend service client + role (exact grants per
#     docs/specs/mqtt-topics.md §4/§5)
# Per-DEVICE clients are NOT created here — the backend provisions those at
# registration over $CONTROL/dynamic-security/v1.
#
# Usage, from the repo root:   ./infra/mosquitto/gen-dynsec.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

get() { grep "^${1}=" .env | head -1 | cut -d'=' -f2-; }

ADMIN_USER="$(get MQTT_DYNSEC_ADMIN_USER)"
ADMIN_PASS="$(get MQTT_DYNSEC_ADMIN_PASSWORD)"
BACKEND_USER="$(get MQTT_BACKEND_USER)"
BACKEND_PASS="$(get MQTT_BACKEND_PASSWORD)"
PREFIX="$(get MQTT_TOPIC_PREFIX)"
PREFIX="${PREFIX:-orbit}"

for v in ADMIN_USER ADMIN_PASS BACKEND_USER BACKEND_PASS; do
    [ -n "${!v}" ] || { echo "missing MQTT_* value for $v in .env" >&2; exit 1; }
done

VOLUME="orbit_mosquitto-data"
STORE="/mosquitto/data/dynamic-security.json"

if ! docker run --rm -v "$VOLUME:/mosquitto/data" eclipse-mosquitto:2 test -f "$STORE"; then
    echo "initialising dynsec store with admin '$ADMIN_USER'"
    docker run --rm -v "$VOLUME:/mosquitto/data" eclipse-mosquitto:2 sh -c \
        "mosquitto_ctrl dynsec init $STORE '$ADMIN_USER' '$ADMIN_PASS' && chown 1883:1883 $STORE"
else
    echo "dynsec store already exists — leaving admin untouched"
fi

echo "starting broker"
docker compose up -d mosquitto >/dev/null 2>&1
sleep 2

# All dynsec administration goes through the broker itself.
ctrl() {
    docker compose exec -T mosquitto \
        mosquitto_ctrl -h localhost -u "$ADMIN_USER" -P "$ADMIN_PASS" dynsec "$@"
}

echo "provisioning orbit-backend client + role (idempotent: delete then create)"
ctrl deleteClient "$BACKEND_USER" >/dev/null 2>&1 || true
ctrl deleteRole orbit-backend-role >/dev/null 2>&1 || true

ctrl createRole orbit-backend-role
ctrl addRoleACL orbit-backend-role subscribePattern      "$PREFIX/devices/+/+/state"      allow 1
ctrl addRoleACL orbit-backend-role publishClientReceive  "$PREFIX/devices/+/+/state"      allow 1
ctrl addRoleACL orbit-backend-role subscribePattern      "$PREFIX/devices/+/availability" allow 1
ctrl addRoleACL orbit-backend-role publishClientReceive  "$PREFIX/devices/+/availability" allow 1
ctrl addRoleACL orbit-backend-role publishClientSend     "$PREFIX/devices/+/+/set"        allow 1
# $SYS read: container healthcheck + future monitoring
ctrl addRoleACL orbit-backend-role subscribePattern      '$SYS/#' allow 1
ctrl addRoleACL orbit-backend-role publishClientReceive  '$SYS/#' allow 1

# No clientid binding here (unlike per-device clients): the healthcheck and the
# backend service connect concurrently under this account with different ids.
ctrl createClient "$BACKEND_USER" -p "$BACKEND_PASS"
ctrl addClientRole "$BACKEND_USER" orbit-backend-role

echo "done — broker healthcheck should go healthy within ~10s"
