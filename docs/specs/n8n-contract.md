<!-- docs/specs/n8n-contract.md -->
# ORBIT ↔ n8n Integration Contract

n8n owns 100% of automation logic. This contract defines the two seams — and only
these two seams — through which n8n and the backend interact. n8n never touches
MQTT or Postgres; it is a REST client of the backend (same tier as the dashboard
and Hermes) plus a webhook server the backend notifies.

Authentication:
- **n8n → backend:** long-lived service JWT with claim `actor_type=n8n`. Every
  state-changing call lands in `audit_log` with `actor_type='n8n'` and
  `actor_context = {"workflow_id": ..., "execution_id": ...}` taken from the
  `X-N8N-Context` request header n8n workflows must set (an HTTP-node header,
  documented in every workflow spec).
- **Backend → n8n:** shared HMAC secret from backend config; each webhook POST is
  signed (`X-Orbit-Signature: sha256=...` over the raw body). n8n webhook nodes
  verify before processing.

---

## Direction 1 — Endpoints the backend exposes for n8n to call

All already defined in `docs/specs/api-contract.yaml`; nothing new is added for
n8n. The useful subset:

| Purpose | Endpoint | Notes |
|---|---|---|
| Execute a scene | `POST /api/v1/scenes/{sceneId}/execute` | The primary "do a thing" primitive for workflows |
| Write one capability | `POST /api/v1/devices/{deviceId}/capabilities/{capability}` | Body `{"value": ...}`; for single actions where a scene is overkill |
| Read current state | `GET /api/v1/devices/{deviceId}/capabilities/{capability}` | For conditions that need fresh state at decision time |
| Read history | `GET /api/v1/devices/{deviceId}/capabilities/{capability}/readings` | For aggregate conditions ("avg over last hour") and scheduled reports |
| List devices / rooms | `GET /api/v1/devices`, `GET /api/v1/rooms` | For dynamic workflows iterating over devices |
| Weather | `GET /api/v1/weather` | Backend-cached; workflows never call the external provider directly |
| System metrics | `GET /api/v1/system/metrics` | For host-health workflows |
| Audit query | `GET /api/v1/audit-log` | For digest/report workflows |
| Data retention job | `GET .../readings` + (Phase A schema note) downsampling endpoint | The scheduled retention/downsampling job from schema.sql lives here as an n8n cron workflow |

Deliberately **not** available to n8n: device create/delete (manual registration),
auth/user management, Hermes's chat API (n8n does not converse with Hermes;
if a workflow wants an AI-written summary, that is a later, explicit contract —
not assumed here).

---

## Direction 2 — Webhooks n8n exposes for the backend to call

The hard problem: workflows need to react to sensor changes ("temperature crossed
28°C") without the backend evaluating that condition. Resolution:

> **The backend forwards raw state-change events. n8n evaluates every condition.**

The backend's Integrations module holds a config-driven **event subscription
table** (Configuration module — file/env-backed, editable without code changes):

```yaml
# config/n8n-subscriptions.yaml (illustrative)
subscriptions:
  - id: bedroom-temp-events
    match:
      device_id: "6b2e..."          # or "*"
      capability: "temperature"      # or "*"
      event: "capability.state"      # capability.state | device.availability
    webhook_url: "http://n8n.internal:5678/webhook/orbit/bedroom-temp"
  - id: all-motion-events
    match: { device_id: "*", capability: "motion", event: "capability.state" }
    webhook_url: "http://n8n.internal:5678/webhook/orbit/motion"
```

**Match fields are identity filters only** (device, capability, event type).
There is deliberately no `value >`, `changed_to`, debounce, or schedule field —
the moment a subscription could express a condition, automation logic would have
leaked into the backend. Value conditions, debouncing, time windows: all n8n IF /
Filter / Wait nodes.

### Webhook payloads (backend → n8n)

`POST {webhook_url}`, JSON, HMAC-signed. Delivery is at-least-once with 3 retries
(exponential backoff); n8n workflows must be idempotent per `event_id`.

**`capability.state`** — emitted whenever the backend persists a new
`capability_readings` row from `orbit/devices/{id}/{capability}/state`:

```json
{
  "event_id": "8c1f0a2e-...",
  "event": "capability.state",
  "device_id": "6b2e...",
  "device_name": "Bedroom Climate Sensor",
  "room_slug": "bedroom",
  "capability": "temperature",
  "value": 28.6,
  "previous_value": 27.9,
  "unit": "°C",
  "recorded_at": "2026-07-11T14:32:05Z"
}
```

(`previous_value` is the prior reading — a convenience lookup, not a computed
condition; edge detection like "crossed 28 upward" is an n8n IF node comparing
the two fields.)

**`device.availability`** — emitted on `is_online` transitions:

```json
{
  "event_id": "1d7a...",
  "event": "device.availability",
  "device_id": "6b2e...",
  "device_name": "Bedroom Climate Sensor",
  "room_slug": "bedroom",
  "online": false,
  "last_seen": "2026-07-11T14:30:11Z"
}
```

**`scene.executed`** — emitted after any scene execution (any actor), for
workflows that chain off scenes:

```json
{
  "event_id": "b2c4...",
  "event": "scene.executed",
  "scene_id": "e91a...",
  "scene_slug": "movie-night",
  "actor_type": "user",
  "executed_at": "2026-07-11T19:02:44Z"
}
```

### Response contract

n8n webhook nodes respond `200` immediately (fire-and-forget from the backend's
view). Anything the workflow decides to *do* comes back through Direction 1 as
authenticated REST calls — the webhook response body is ignored, so no logic can
hide in it.
