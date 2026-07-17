/* API types mirroring docs/specs/api-contract.yaml. */

export interface Room {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  device_count?: number;
}

export type CapabilityAccess = "read" | "write" | "read_write";
export type CapabilityDataType =
  | "float"
  | "int"
  | "bool"
  | "string"
  | "enum"
  | "json";

export interface CapabilityState {
  id: string;
  device_id: string;
  capability: string;
  data_type: CapabilityDataType;
  unit: string | null;
  access: CapabilityAccess;
  label: string;
  config: Record<string, unknown>;
  value: unknown;
  reported_at: string | null;
}

export interface Device {
  id: string;
  room_id: string | null;
  name: string;
  type: string;
  firmware_version: string | null;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceDetail extends Device {
  capabilities: CapabilityState[];
}

export interface DeviceCreated extends DeviceDetail {
  mqtt_credentials: {
    username: string;
    password: string;
    state_topic_prefix: string;
  };
}

export interface SceneAction {
  device_id: string;
  capability: string;
  payload: { value: unknown };
  sort_order: number;
}

export interface Scene {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  actions: SceneAction[];
}

export interface SceneExecutionResult {
  scene_id: string;
  audit_id: string;
  results: Array<{
    device_id: string;
    capability: string;
    status: "published" | "skipped_offline" | "error";
  }>;
}

export interface AuditEntry {
  id: string;
  actor_type: "user" | "hermes" | "n8n";
  actor_user_id: string | null;
  actor_context: Record<string, unknown>;
  action: string;
  target_type: string;
  target_id: string | null;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
}

export interface SystemMetrics {
  cpu: {
    usage_percent: number;
    load_avg_1m: number;
    load_avg_5m: number;
    load_avg_15m: number;
    temperature_c: number | null;
  };
  memory: { total_bytes: number; used_bytes: number; usage_percent: number };
  disk: Array<{
    mount: string;
    total_bytes: number;
    used_bytes: number;
    usage_percent: number;
  }>;
  uptime_seconds: number;
  collected_at: string;
}

export interface Weather {
  location: string;
  current: {
    temperature_c: number;
    humidity_percent: number;
    condition: string;
    wind_kph: number;
  };
  forecast: Array<{
    date: string;
    min_c: number;
    max_c: number;
    condition: string;
  }>;
  fetched_at: string;
  cache_expires_at: string;
}

export interface AiUsageEntry {
  id: string;
  conversation_id: string | null;
  message_id: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  created_at: string;
}

export interface AiUsageAggregate {
  group: string;
  request_count: number;
  total_tokens: number;
  total_cost_usd: number;
}

export interface AuthSessionInfo {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  current: boolean;
}

export interface Me {
  id: string | null;
  email: string | null;
  display_name: string;
  role: string | null;
  actor_type: "user" | "hermes" | "n8n";
}

export interface Reading {
  value: unknown;
  recorded_at: string;
}

export interface ReadingsResponse {
  device_id: string;
  capability: string;
  interval: string | null;
  aggregate: string | null;
  data: Reading[];
}

export interface DashboardWidgetInstance {
  id?: string;
  widget_type: string;
  source: import("@/config/widgets.config").WidgetSource;
  size: import("@/config/widgets.config").WidgetSize;
  position: number;
  title_override: string | null;
}

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
}
