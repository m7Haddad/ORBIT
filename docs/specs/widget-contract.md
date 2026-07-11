<!-- docs/specs/widget-contract.md -->
# ORBIT Widget Contract

Every dashboard tile implements one contract. Widgets are **capability-driven and
registered**, never hardcoded per device (CLAUDE.md). This document defines the
props, the registration manifest, and the data-flow rules; `widgets.config.ts`
is the concrete registry.

## 1. The `source` discriminated union

Most widgets are bound to a `device_capabilities` row. Three are not: weather
(`GET /api/v1/weather`), system status (`GET /api/v1/system/metrics`), and the
AI chat panel (Hermes chat API, `POST /v1/chat` — Phase B). Rather than making
`deviceId` optional and hoping nobody passes nonsense, the binding is a
discriminated union — one consistent pattern, enforced by the compiler:

```ts
type WidgetSource =
  | {
      kind: "device";
      deviceId: string;        // devices.id (UUID)
      capability: string;      // device_capabilities.capability, e.g. "temperature"
    }
  | { kind: "weather"; location?: string }   // maps to GET /weather?location=
  | { kind: "system" }                        // maps to GET /system/metrics
  | { kind: "hermes" };                       // maps to Hermes chat API (Phase B)
```

Rules:
- A widget declares which `kind`(s) it accepts in its manifest; the dashboard
  grid refuses to instantiate a widget with a source kind it didn't declare.
- Nothing else about the contract differs between device and non-device
  widgets — same sizing, same skeleton behavior, same registration path.
- Future non-device widgets (Phase 2 cameras, energy analytics) add a new
  `kind` variant here; they do not invent parallel prop shapes.

## 2. Widget props

```ts
type WidgetSize = "1x1" | "2x1" | "2x2" | "4x2";
// Grid units, not pixels. 1 unit = one grid cell; the grid defines cell
// dimensions per breakpoint. "4x2" exists for hermes/chart widgets only.

interface WidgetProps {
  /** Stable instance id (dashboard layout row), for layout persistence + React keys. */
  instanceId: string;

  /** What this widget is bound to. */
  source: WidgetSource;

  /** Current rendered size. Must be one of the manifest's supportedSizes. */
  size: WidgetSize;

  /** Presentation-only context resolved by the shell (never fetched by the widget). */
  context: {
    /** Display title: capability label for device widgets ("Temperature"),
        fixed label otherwise ("Weather"). Overridable per instance by the user. */
    title: string;
    /** Room slug for device widgets; undefined for non-device. */
    roomSlug?: string;
    /** device_capabilities.unit and .config, passed through so the widget
        never re-fetches its own definition. */
    unit?: string | null;
    capabilityConfig?: Record<string, unknown>;
    access?: "read" | "write" | "read_write";
  };

  /** Edit-mode flag: when true the widget renders inert (grid is rearranging). */
  editing?: boolean;
}
```

Deliberately **absent** from props: fetched values, WebSocket handles, callbacks
like `onToggle`. Widgets get live data through shared hooks (below), not prop
drilling — a widget must be instantiable from `(instanceId, source, size,
context)` alone, which is exactly what the layout table persists.

## 3. Data flow (contract-level, not implementation)

- **Reads:** one shared realtime store, hydrated by REST
  (`GET /devices/{id}/capabilities/{capability}` etc.) and updated by the
  WebSocket push. Widgets subscribe via `useCapabilityState(source)` /
  `useWeather()` / `useSystemMetrics()` — they never open their own sockets or
  fetch loops.
- **Writes:** `useCapabilityWrite(source)` posts to
  `POST /devices/{id}/capabilities/{capability}` and applies **optimistic UI**
  (CLAUDE.md): flip immediately, reconcile on the WebSocket-confirmed state,
  roll back with a subtle error affordance on `409 device_offline` / `4xx`.
- **History:** chart-capable widgets use `useCapabilityHistory(source, range,
  interval)` → `GET .../readings?from=&interval=&aggregate=`.
- **Skeletons:** every widget must render a skeleton at every supported size
  while its hook reports `loading` — no spinners, no layout shift.
- **Hermes:** the chat widget talks only to the Hermes chat API
  (`/chat`, `/chat/confirm`, `/conversations/*`) and must render
  `actions_taken` summaries and the `pending_confirmation` approve/deny
  affordance from the Phase B response shape.

## 4. Registration manifest

Each widget type registers once in `widgets.config.ts`:

```ts
interface WidgetManifest {
  /** Registry key, e.g. "sensor", "toggle", "climate". */
  type: string;

  /** Human name for the widget picker. */
  displayName: string;

  /** Which source kinds this widget accepts. */
  sourceKinds: Array<WidgetSource["kind"]>;

  /**
   * For kind "device": which capabilities this widget can render.
   * Matched against device_capabilities.capability. A capability may match
   * multiple widgets (e.g. temperature → sensor AND chart); the first entry
   * in defaultWidgetFor wins as the auto-placed default.
   */
  capabilities?: string[];

  supportedSizes: WidgetSize[];
  defaultSize: WidgetSize;

  /** Lazy component reference (code-split per widget). */
  component: () => Promise<{ default: React.ComponentType<WidgetProps> }>;
}
```

Resolution rule: when a device capability needs a tile, the shell looks up
`capability → widget type` in the registry's `defaultWidgetFor` map; users may
swap to any other manifest whose `capabilities` includes it. **Reuse before new
components**: a new capability that is shape-compatible with an existing widget
(another `float` sensor, another `bool` binary) extends that widget's
`capabilities` array — it does not get its own component (per the
`orbit-add-device-capability` skill, step 4).

## 5. Capability → widget map (from the Phase A catalog)

| Capability | data_type / access | Widget type | Notes |
|---|---|---|---|
| `temperature` | float, read | `sensor` | value + unit + sparkline |
| `humidity` | float, read | `sensor` | same component, different source |
| `energy_power` | float, read | `sensor` | ditto; chart widget optional alt |
| `power` | bool, read_write | `toggle` | optimistic UI required |
| `motion` | bool, read | `binary` | state chip + last-triggered time |
| `contact` | bool, read | `binary` | labels from `config.labels` |
| `ir_command` | enum, write | `remote` | button grid from `config.values` |
| `ac_control` | json, read_write | `climate` | mode/setpoint/fan from `config.schema` |
| — | — | `weather` | `kind: "weather"` |
| — | — | `system` | `kind: "system"`, CPU/RAM/disk/uptime |
| — | — | `hermes` | `kind: "hermes"`, chat panel |
| any numeric | float/int, read | `chart` | history view, alt widget for sensors |
| — | — | `scene` | scene quick-run tile → `POST /scenes/{id}/execute`; source is `kind: "device"`-exempt — see note |

**Scene tile note:** scenes are not devices; rather than adding a fourth-and-a-half
pattern, the scene tile is registered under a `{ kind: "scene"; sceneId: string }`
variant added to `WidgetSource`. It's included in the union in
`widgets.config.ts` since day one needs it.
