<!-- docs/specs/workflow-examples.md -->
# ORBIT Workflow Examples (n8n specifications)

Three build-by-hand specs proving the Direction-1 + Direction-2 contracts are
sufficient. Format: **Trigger → Condition → Action**, with every condition inside
n8n and every action an authenticated backend REST call carrying the
`X-N8N-Context: {"workflow_id": ..., "execution_id": ...}` header.

Capability names, endpoints, and payload shapes are exactly those in
`capability-catalog.md` and `api-contract.yaml`.

---

## WF-1 — Hallway light on motion, after sunset, auto-off

**Goal:** Motion in the hallway after sunset turns the hallway light on for 5
minutes; retriggering motion extends the window.

- **Trigger:** Webhook node at `/webhook/orbit/motion`, fed by backend
  subscription `{device_id: <hallway-motion-sensor>, capability: "motion",
  event: "capability.state"}`.
- **Conditions (all n8n):**
  1. IF `value == true AND previous_value == false` (rising edge only).
  2. IF current time is between sunset and sunrise — n8n Sun/Schedule logic
     using the home's lat/long configured in the workflow (no backend endpoint
     involved; the backend's `/weather` cache is not extended for this).
- **Actions:**
  1. `POST /api/v1/devices/{hallway-light-id}/capabilities/power` body
     `{"value": true}`.
  2. Wait node: 5 minutes, **resettable** — implemented as the standard n8n
     debounce pattern (workflow static data stores the latest `event_id`; after
     the wait, an IF checks whether a newer motion event superseded this
     execution and exits without acting if so).
  3. Before switching off, `GET .../capabilities/motion` for fresh state; IF
     `value == false` → `POST .../capabilities/power` body `{"value": false}`.
     (Fresh read at decision time, per Direction 1.)
- **Idempotency:** keyed on `event_id`; duplicate webhook deliveries short-circuit.
- **Audit trail it produces:** two `device.capability.write` entries with
  `actor_type='n8n'`.

---

## WF-2 — Overheat guard: bedroom > 28 °C → cool to 24 °C + notify

**Goal:** If the bedroom gets hot while someone's home in the evening, start the
AC and tell the household — with a cooldown so it doesn't spam.

- **Trigger:** Webhook at `/webhook/orbit/bedroom-temp`, subscription
  `{device_id: <bedroom-climate-sensor>, capability: "temperature"}`.
- **Conditions (all n8n):**
  1. IF `value >= 28.0 AND previous_value < 28.0` (upward crossing — the
     backend sent both numbers; n8n does the comparison).
  2. IF time between 17:00–23:00 local (Schedule/IF node).
  3. Cooldown: workflow static data stores `last_fired_at`; IF more than 45
     minutes ago, proceed, else exit.
- **Actions:**
  1. `POST /api/v1/devices/{bedroom-ac-id}/capabilities/ac_control` body
     `{"value": {"mode": "cool", "setpoint_c": 24.0, "fan": "auto"}}`.
  2. Telegram node (n8n's own Telegram credential, unrelated to Hermes's
     gateway): "Bedroom hit 28.6 °C — AC set to cool 24 °C."
  3. Update `last_fired_at` in static data.
- **Note:** the same physical AC that Hermes needs confirmation to control is
  freely writable by n8n — the confirmation gate in `hermes-tool-manifest.json`
  is about an LLM acting autonomously, not about the capability itself. The
  human "approved" this workflow by building it.
- **Audit trail:** one `device.capability.write`, `actor_type='n8n'`,
  `after_state` containing the full `ac_control` JSON.

---

## WF-3 — Nightly energy digest + standby-killer

**Goal:** At 23:30, report the day's energy picture and switch off devices idling
in standby.

- **Trigger:** n8n Cron node, daily 23:30 (schedules live in n8n by definition —
  the backend has no scheduler).
- **Data gathering:**
  1. `GET /api/v1/devices?online=true` → iterate devices exposing `energy_power`.
  2. Per device: `GET .../capabilities/energy_power/readings?from={today T00:00}
     &interval=1h&aggregate=avg` for the daily profile, and
     `...&from={now-30m}&aggregate=avg` for current draw.
- **Conditions (all n8n):**
  - Standby candidate: 30-min average draw `> 0.5 W AND < 15 W`, device also has
    a `power` capability, and device is on an allowlist stored in the workflow
    (never auto-kill the fridge).
- **Actions:**
  1. For each candidate: `POST .../capabilities/power` body `{"value": false}`.
  2. Compose digest (total est. kWh from hourly averages, top consumers, list of
     devices switched off) → Telegram node.
- **Audit trail:** N × `device.capability.write` (`actor_type='n8n'`), giving
  the morning-after answer to "why is the TV off" via
  `GET /api/v1/audit-log?actor_type=n8n&from=...`.

---

**Sufficiency check:** the three workflows collectively exercise every Direction-2
event type except `scene.executed`, both Direction-1 write primitives, fresh-state
reads, historical aggregation, and idempotent webhook handling — with zero
conditional logic anywhere in the backend or Hermes.
