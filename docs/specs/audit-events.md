<!-- docs/specs/audit-events.md -->
# ORBIT Audit Event Taxonomy

Enumerated values for `audit_log.action` (Phase A schema). Format:
`{target}.{event}` — dot-separated, lowercase, past-tense or noun where natural.
**Only state changes are audited**; reads are not, with one deliberate exception
(`hermes.tool.invoked`, which logs every Hermes tool call including reads,
because an autonomous actor's full trail matters more than log volume).

Column semantics recap: `actor_type` ∈ `user | hermes | n8n`; `actor_user_id`
required iff `actor_type='user'`; `actor_context` carries
`{conversation_id, message_id}` for Hermes and `{workflow_id, execution_id}`
for n8n.

## Device lifecycle

| action | actors | target | before → after |
|---|---|---|---|
| `device.registered` | user | `device` / device id | `null` → full device record incl. capabilities (MQTT password never logged, only `mqtt_username`) |
| `device.updated` | user | `device` | changed fields only, old → new (e.g. `{"room_id": ...}` → `{"room_id": ...}`) |
| `device.deleted` | user | `device` | full record → `null` |
| `device.capability.declared` | user | `capability` / device_capabilities id | `null` → capability definition |

Only `user` — device lifecycle is manual by constraint #4; Hermes and n8n are
denied these endpoints by manifest/contract.

## Capability state changes

| action | actors | target | before → after |
|---|---|---|---|
| `device.capability.write` | user, hermes, n8n | `capability` | last known reported value → commanded value, plus `{"request_id": ...}` correlating to the MQTT `set` publish. Written at command **acceptance** (the 202), not device confirmation — the audit log records intent + attribution; confirmed state lives in `capability_readings`. |

Not audited: device-reported state arriving on `.../state` topics — that is
telemetry (`capability_readings`), not an actor's action. Auditing it would bury
every real action under sensor noise.

## Scenes

| action | actors | target | before → after |
|---|---|---|---|
| `scene.created` | user | `scene` | `null` → scene + actions |
| `scene.updated` | user | `scene` | old scene+actions → new (full snapshot both sides; actions are replace-on-write per the API) |
| `scene.deleted` | user | `scene` | scene+actions → `null` |
| `scene.executed` | user, hermes, n8n | `scene` | `null` → per-action result list (the `SceneExecutionResult.results` array). The individual capability writes it fans out to are **not** separately audited — the execution entry with its result list is the record, avoiding double-counting. |

Scene definition is user-only (Hermes manifest excludes it; n8n contract
excludes it). Execution is all three actors.

## Rooms

| action | actors | target | before → after |
|---|---|---|---|
| `room.created` | user | `room` | `null` → room |
| `room.updated` | user | `room` | changed fields old → new |
| `room.deleted` | user | `room` | room → `null` (device unassignment implied, not separately audited) |

## Auth

| action | actors | target | before → after |
|---|---|---|---|
| `auth.login` | user | `user` | `null` → `{"session_id": ..., "ip": ..., "user_agent": ...}` |
| `auth.login.failed` | user (actor_user_id nullable — unknown email allowed here as the one exception, with attempted email in after_state) | `user` | `null` → `{"email": ..., "ip": ...}` |
| `auth.logout` | user | `user` | `{"session_id": ...}` → `null` |
| `auth.refresh.rotated` | user | `user` | old session id → new session id |

## Hermes-specific

| action | actors | target | before → after |
|---|---|---|---|
| `hermes.tool.invoked` | hermes | varies (`device`, `capability`, `scene`, or `null` for pure reads like `get_weather`) | `null` → `{"tool": ..., "parameters": ..., "state_changing": bool}`. Logged for **every** manifest tool call, reads included. When the tool is itself state-changing, the corresponding write entry (`device.capability.write` / `scene.executed`) is *also* written — `actor_context.message_id` ties the pair together. |
| `hermes.confirmation.requested` | hermes | varies | `null` → `{"confirmation_id": ..., "tool": ..., "summary": ...}` |
| `hermes.confirmation.resolved` | user | varies | pending confirmation → `{"approved": bool}` — resolved by the **user**, which is exactly the point: the manifest's `requires_confirmation` boundary is visible in the log as an actor handoff. |

## n8n-specific

| action | actors | target | before → after |
|---|---|---|---|
| `n8n.event.delivered` | n8n (system-emitted with actor_type='n8n' since the event exists to serve n8n) | `device` or `scene` | `null` → `{"event": ..., "event_id": ..., "subscription_id": ..., "webhook_url": ..., "attempts": n}`. Written on final delivery success **or** exhaustion of retries (`"delivered": false`) — the debugging answer to "why didn't my workflow fire". |

There is no `n8n.workflow.triggered` event: the backend cannot know when n8n
workflows run (cron triggers never touch the backend). What the backend *can*
attest is what it delivered (`n8n.event.delivered`) and what n8n did in response
(`device.capability.write` / `scene.executed` with `actor_type='n8n'` and
`actor_context.workflow_id`). Workflow execution history itself lives in n8n's
own execution log — duplicating it here would be a second source of truth.

## Reserved for Phase 2+ (documented so names don't drift)

`user.created`, `user.updated`, `user.deactivated`, `camera.stream.accessed`,
`notification.sent`, `firmware.ota.initiated`.
