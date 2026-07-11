<!-- docs/specs/capability-catalog.md -->
# ORBIT Capability Catalog (day-one seed)

Reference examples for the `orbit-add-device-capability` skill. Every capability
lives in the same three places:

- **Schema:** one row in `device_capabilities` (definition) + history in
  `capability_readings` (`value_numeric` for float/int/bool, `value_text` for
  string/enum, `value_json` for json).
- **MQTT:** `orbit/devices/{id}/{capability}/state` (retained) and, if writable,
  `orbit/devices/{id}/{capability}/set`.
- **REST:** `GET /api/v1/devices/{id}/capabilities/{capability}` and, if writable,
  `POST` to the same path. History: `GET .../{capability}/readings`.

`{cap}` below abbreviates the capability name.

| Capability | data_type | Unit | Access | config | Readings column | MQTT topics | Widget guidance |
|---|---|---|---|---|---|---|---|
| `temperature` | `float` | `°C` | `read` | `{"min": -40, "max": 85, "precision": 0.1}` | `value_numeric` | `{cap}/state` | sensor widget (value + sparkline) |
| `humidity` | `float` | `%` | `read` | `{"min": 0, "max": 100, "precision": 0.5}` | `value_numeric` | `{cap}/state` | reuse the same sensor widget as `temperature` — same shape, no new component |
| `power` | `bool` | — | `read_write` | `{}` | `value_numeric` (0/1) | `{cap}/state` + `{cap}/set` | toggle widget with optimistic UI |
| `ir_command` | `enum` | — | `write` | `{"values": ["power", "vol_up", "vol_down", "mute", "input_hdmi1", "input_hdmi2"]}` — per-device list | none persisted as state (write-only; sends land in `audit_log`, not `capability_readings`) | `{cap}/set` only (no state topic) | button-grid / remote widget |
| `ac_control` | `json` | — | `read_write` | `{"schema": {"mode": ["off","cool","heat","fan","dry"], "setpoint_c": {"min": 16, "max": 30, "step": 0.5}, "fan": ["auto","low","med","high"]}}` | `value_json` | `{cap}/state` + `{cap}/set` | climate widget (mode selector + setpoint dial + fan) |
| `motion` | `bool` | — | `read` | `{"clear_after_s": 30}` (informational — the timeout runs on the device; any "if motion then…" rule is an n8n workflow) | `value_numeric` (0/1) | `{cap}/state` | binary-sensor widget (reuse for `contact`) |
| `contact` | `bool` | — | `read` | `{"labels": {"true": "Open", "false": "Closed"}}` | `value_numeric` (0/1) | `{cap}/state` | reuse the binary-sensor widget with label mapping |
| `energy_power` | `float` | `W` | `read` | `{"min": 0, "precision": 0.1}` | `value_numeric` | `{cap}/state` | sensor widget now; feeds Phase 2 energy analytics without schema changes |

Notes:

- **Why `motion`, `contact`, `energy_power` as the extra three:** they are the
  highest-leverage *inputs* for day-one n8n workflows (presence, security,
  energy) while requiring zero new backend behavior — pure state reporting.
- **Write-only capabilities** (`ir_command`) have no `state` topic and no
  retained value; `GET` on the capability returns the definition with
  `value: null`. Their attribution trail is the audit log.
- **Composite capabilities** (`ac_control`) report full state as one JSON object
  on every change (not per-field topics) so the retained message is always a
  complete, consistent snapshot.
- Adding anything beyond this list follows
  `.claude/skills/add-device-capability/SKILL.md` — schema row → backend/REST →
  MQTT topics → widget registration, with automation (if any) in n8n and Hermes
  exposure (if any) via REST only.
