---
name: orbit-add-device-capability
description: Use this skill whenever adding a new device capability (a sensor reading or actuator control) to ORBIT, or adding the dashboard widget for one. Covers the required steps across the device schema, backend module boundaries, MQTT topic conventions, REST exposure, and frontend widget registration, so new capabilities integrate consistently with ORBIT's modular monolith and capability-driven widget system. Triggers on requests like "add a new sensor type", "add support for controlling X", "create a widget for Y", or "register a new device capability".
---

# Adding a new device capability to ORBIT

A "capability" is one thing a device can report or be told to do — e.g. `temperature`
(read-only sensor), `power` (read/write actuator), `ir_command` (write-only action).
Every capability follows the same path across four layers. Do all four; skipping one
is how the widget system and the device model drift out of sync.

## Steps

1. **Define the capability.** Add it to the shared capability schema (backend
   `domain/` layer) with: name, data type, unit (if applicable), read/write/read-write,
   and a human-readable label. This is the single source of truth other layers read from.

2. **Backend.** Add the capability to the device model's capability list. Add
   repository/service methods only if new persistence is needed. Expose it via REST,
   e.g. `GET/POST /api/v1/devices/{id}/capabilities/{capability}`. Do not add any
   conditional or triggered behavior here — automation logic belongs in n8n, not the
   backend, regardless of how small it seems.

3. **MQTT.** Use the existing topic convention:
   `orbit/devices/{device_id}/{capability}/state` for reported state (retained),
   `orbit/devices/{device_id}/{capability}/set` for commands (not retained). Document
   the payload shape in the capability definition from step 1.

4. **Frontend.** Register the capability → widget mapping in
   `src/config/widgets.config.ts`. Build the widget under `src/components/widgets/`
   implementing the shared widget contract (expects `deviceId`, `capability`, `size`
   props — no bespoke one-off props). Reuse an existing widget type if the capability
   fits one (e.g. a new binary sensor should reuse the toggle widget, not spawn a new
   component) rather than creating a near-duplicate.

5. **n8n (only if this capability should drive automation).** Add the trigger/action
   node in n8n referencing the new REST endpoint or MQTT topic. Do not hardcode any
   "if this capability crosses threshold X, do Y" logic in the backend or in Hermes —
   that rule lives in n8n as a workflow, full stop.

6. **Hermes exposure (only if Hermes should be able to read/act on this capability).**
   Add the endpoint to Hermes's scoped tool/function-calling manifest. Hermes must
   never reach this capability through MQTT directly — REST only, same as every other
   backend interaction.

## Non-negotiables to re-check before finishing

- Nothing conditional was added to the backend or Hermes.
- The capability is reachable through the REST API, not just MQTT.
- The frontend widget reuses the shared widget contract instead of introducing a
  parallel pattern.
- The action is attributable in the audit log (user / Hermes / n8n) if it's writable.

## Example

Adding `humidity` (read-only sensor, unit `%`):
- Schema: `humidity: { type: float, unit: "%", access: read }`
- MQTT: `orbit/devices/{id}/humidity/state`
- REST: `GET /api/v1/devices/{id}/capabilities/humidity`
- Widget: reuse the existing sensor-widget, pass `capability="humidity"` — no new
  component needed, since it's the same shape as `temperature`.
