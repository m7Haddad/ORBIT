<!-- docs/specs/command-palette.md -->
# ORBIT Command Palette (⌘K) Spec

Global palette: `⌘K` / `Ctrl+K` anywhere, plus a search affordance in the top
bar. Renders on `--surface-3` with `--material-*` (so it's the flagship
glassmorphism moment in the Glass theme). Fuzzy matching over a flat action
index; grouped results; full keyboard navigation (↑↓ / Enter / Esc; Tab cycles
groups).

## 1. Action model

Every palette entry is one shape:

```ts
interface PaletteAction {
  id: string;                 // stable, e.g. "room:living-room", "device:{uuid}:power"
  category: PaletteCategory;  // grouping + ranking
  label: string;              // "Living Room", "Hallway Light"
  sublabel?: string;          // room name, scene description, current state
  keywords: string[];         // extra fuzzy-match terms ("lights", "lamp")
  icon: string;               // icon key (same vocabulary as rooms.icon)
  perform: Route | Command;   // navigation or an action, never both
}
```

`Route` = client-side navigation. `Command` = a single backend/Hermes call with
optimistic feedback in the palette row itself. **Palette commands are the same
REST calls the widgets make — the palette introduces zero new endpoints and
zero new logic; it is an alternate trigger surface.**

## 2. Categories

Ranked in this order when the query is empty; fuzzy score wins once typing.

### `navigate` — rooms & pages
- Source: `GET /api/v1/rooms` (cached client-side) + static pages
  (Dashboard, Devices, Scenes, Audit Log, AI Usage, Settings).
- Resolves to: `Route` — `/rooms/{slug}`, `/devices`, `/scenes`, `/audit`,
  `/ai-usage`, `/settings`.
- Example: typing "liv" → **Living Room** → navigates.

### `device` — toggle a device
- Source: `GET /api/v1/devices` joined with capabilities; **only devices
  exposing a `power` (bool, read_write) capability get a command row.**
  Composite capabilities (`ac_control`) and write-only ones (`ir_command`)
  deep-link (`Route` to the room with the widget focused/highlighted) instead —
  a palette row can't honestly render a setpoint dial or a 6-button remote.
- Resolves to: `Command` → `POST /api/v1/devices/{id}/capabilities/power`
  `{"value": <negation of current state>}` — optimistic flip of the row's
  state chip, reconciled by the WebSocket push, rolled back on `409
  device_offline` with a `--status-danger` shake.
- Sublabel shows live state ("On · Hallway") from the shared realtime store.
- Audit: lands as `device.capability.write`, `actor_type='user'` — identical to
  a widget toggle.

### `scene` — run a scene
- Source: `GET /api/v1/scenes`.
- Resolves to: `Command` → `POST /api/v1/scenes/{sceneId}/execute`; row shows a
  transient "Running…" then per-action summary from `SceneExecutionResult`
  (e.g. "4 published, 1 offline").
- Audit: `scene.executed`, `actor_type='user'`.

### `hermes` — ask Hermes
- Trigger: prefix `?` **or** fallback row "Ask Hermes: '{query}'" pinned last
  whenever the fuzzy results are weak.
- Resolves to: `Route` to the Hermes chat panel with the query pre-submitted
  via `POST /v1/chat` (Phase B) — source `dashboard`, continuing the user's
  most recent conversation (new one if none). The palette itself never renders
  the reply; conversation UX belongs to the chat widget, including any
  `pending_confirmation` flow.

### `settings` — jump to settings
- Static entries: Appearance (theme switch — the four themes are directly
  selectable as palette actions: "Theme: Midnight"), Account, Devices &
  Registration, Sessions.
- Resolves to: `Route` to `/settings/{section}`; theme entries are the one
  local-only `Command` (sets `data-theme`, persists to the user's preferences).

## 3. Index & freshness

- The action index is built client-side from data already in the realtime
  store/query cache (rooms, devices, scenes) — opening the palette costs no
  network round-trip; a stale-while-revalidate refetch runs in the background.
- Index rebuild triggers: WebSocket events for device/room/scene mutations.
- Recency ranking: last 5 performed action ids persist to user preferences and
  float to the top of empty-query results ("Suggested").

## 4. Explicit non-goals

- **No automation authoring.** No "create rule", "schedule scene", "when X
  then Y" entries — palette or otherwise, that authoring lives in n8n's own UI.
- No device registration from the palette (manual, deliberate flow per
  CLAUDE.md constraint #4) — only a `navigate` row to the registration page.
- No multi-step wizards inside the palette; anything needing more than one
  input deep-links to the proper surface.
