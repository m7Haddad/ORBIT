// docs/specs/widgets.config.ts
// ORBIT widget registry — the single place capabilities map to widgets.
// Per CLAUDE.md this is config, not logic: no conditionals, no fetching,
// no per-device data (e.g. ir_command button labels come from the
// capability's `config.values` at runtime, never from this file).

import type { ComponentType } from "react";

// ---------------------------------------------------------------------------
// Contract types (canonical definitions live here; widgets import from here)
// ---------------------------------------------------------------------------

export type WidgetSize = "1x1" | "2x1" | "2x2" | "4x2";

export type WidgetSource =
  | { kind: "device"; deviceId: string; capability: string }
  | { kind: "weather"; location?: string }
  | { kind: "system" }
  | { kind: "hermes" }
  | { kind: "scene"; sceneId: string };

export interface WidgetContext {
  title: string;
  roomSlug?: string;
  unit?: string | null;
  capabilityConfig?: Record<string, unknown>;
  access?: "read" | "write" | "read_write";
}

export interface WidgetProps {
  instanceId: string;
  source: WidgetSource;
  size: WidgetSize;
  context: WidgetContext;
  editing?: boolean;
}

export interface WidgetManifest {
  type: string;
  displayName: string;
  sourceKinds: Array<WidgetSource["kind"]>;
  capabilities?: string[];
  supportedSizes: WidgetSize[];
  defaultSize: WidgetSize;
  component: () => Promise<{ default: ComponentType<WidgetProps> }>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const widgetRegistry: WidgetManifest[] = [
  {
    type: "sensor",
    displayName: "Sensor",
    sourceKinds: ["device"],
    // One component for every read-only numeric capability (Phase A catalog).
    // New float/int sensors extend this array — they do NOT get new widgets.
    capabilities: ["temperature", "humidity", "energy_power"],
    supportedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "1x1",
    component: () => import("@/components/widgets/SensorWidget"),
  },
  {
    type: "toggle",
    displayName: "Toggle",
    sourceKinds: ["device"],
    capabilities: ["power"],
    supportedSizes: ["1x1", "2x1"],
    defaultSize: "1x1",
    component: () => import("@/components/widgets/ToggleWidget"),
  },
  {
    type: "binary",
    displayName: "Binary Sensor",
    sourceKinds: ["device"],
    // motion and contact share one component; labels come from
    // context.capabilityConfig.labels when present.
    capabilities: ["motion", "contact"],
    supportedSizes: ["1x1", "2x1"],
    defaultSize: "1x1",
    component: () => import("@/components/widgets/BinarySensorWidget"),
  },
  {
    type: "remote",
    displayName: "Remote",
    sourceKinds: ["device"],
    // Button grid rendered from context.capabilityConfig.values at runtime.
    capabilities: ["ir_command"],
    supportedSizes: ["2x2"],
    defaultSize: "2x2",
    component: () => import("@/components/widgets/RemoteWidget"),
  },
  {
    type: "climate",
    displayName: "Climate",
    sourceKinds: ["device"],
    // Mode/setpoint/fan constraints from context.capabilityConfig.schema.
    capabilities: ["ac_control"],
    supportedSizes: ["2x2", "4x2"],
    defaultSize: "2x2",
    component: () => import("@/components/widgets/ClimateWidget"),
  },
  {
    type: "chart",
    displayName: "History Chart",
    sourceKinds: ["device"],
    // Alternative view for any numeric capability; uses
    // GET .../capabilities/{capability}/readings.
    capabilities: ["temperature", "humidity", "energy_power"],
    supportedSizes: ["2x2", "4x2"],
    defaultSize: "4x2",
    component: () => import("@/components/widgets/ChartWidget"),
  },
  {
    type: "weather",
    displayName: "Weather",
    sourceKinds: ["weather"],
    supportedSizes: ["2x1", "2x2"],
    defaultSize: "2x1",
    component: () => import("@/components/widgets/WeatherWidget"),
  },
  {
    type: "system",
    displayName: "System Status",
    sourceKinds: ["system"],
    supportedSizes: ["2x1", "2x2", "4x2"],
    defaultSize: "2x2",
    component: () => import("@/components/widgets/SystemStatusWidget"),
  },
  {
    type: "hermes",
    displayName: "Hermes",
    sourceKinds: ["hermes"],
    supportedSizes: ["2x2", "4x2"],
    defaultSize: "4x2",
    component: () => import("@/components/widgets/HermesChatWidget"),
  },
  {
    type: "scene",
    displayName: "Scene",
    sourceKinds: ["scene"],
    supportedSizes: ["1x1", "2x1"],
    defaultSize: "1x1",
    component: () => import("@/components/widgets/SceneTileWidget"),
  },
];

// ---------------------------------------------------------------------------
// Default widget per capability (auto-placement when a device is registered).
// A capability may appear in several manifests above; this map decides which
// one the dashboard places by default. Users can swap afterward.
// ---------------------------------------------------------------------------

export const defaultWidgetFor: Record<string, string> = {
  temperature: "sensor",
  humidity: "sensor",
  energy_power: "sensor",
  power: "toggle",
  motion: "binary",
  contact: "binary",
  ir_command: "remote",
  ac_control: "climate",
};

// ---------------------------------------------------------------------------
// Lookup helpers (pure, no side effects — still config-tier code)
// ---------------------------------------------------------------------------

export function manifestForType(type: string): WidgetManifest | undefined {
  return widgetRegistry.find((m) => m.type === type);
}

export function manifestsForCapability(capability: string): WidgetManifest[] {
  return widgetRegistry.filter((m) => m.capabilities?.includes(capability));
}
