/* Typed API client for the ORBIT backend (docs/specs/api-contract.yaml).
 * Same-origin /api/v1 through Caddy; bearer auth; one transparent
 * 401 → refresh → retry. */

import { getAccessToken, refreshSession } from "@/lib/auth";
import type {
  AiUsageAggregate,
  AiUsageEntry,
  AuditEntry,
  AuthSessionInfo,
  CapabilityState,
  DashboardWidgetInstance,
  Device,
  DeviceCreated,
  DeviceDetail,
  Me,
  PageMeta,
  ReadingsResponse,
  Room,
  Scene,
  SceneExecutionResult,
  SystemMetrics,
  Weather,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined>;

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Query } = {},
  retried = false,
): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const url = `/api/v1${path}${params.size ? `?${params}` : ""}`;

  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && !retried && (await refreshSession())) {
    return request<T>(path, options, true);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.code ?? "error",
      body?.error?.message ?? response.statusText,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  me: () => request<Me>("/auth/me"),
  sessions: () => request<{ data: AuthSessionInfo[] }>("/auth/sessions"),
  revokeSession: (id: string) =>
    request<void>(`/auth/sessions/${id}`, { method: "DELETE" }),

  rooms: () => request<{ data: Room[] }>("/rooms"),
  createRoom: (body: { name: string; icon?: string; sort_order?: number }) =>
    request<Room>("/rooms", { method: "POST", body }),
  updateRoom: (id: string, body: Partial<Pick<Room, "name" | "icon" | "sort_order">>) =>
    request<Room>(`/rooms/${id}`, { method: "PATCH", body }),
  deleteRoom: (id: string) => request<void>(`/rooms/${id}`, { method: "DELETE" }),

  devices: (query?: Query) =>
    request<{ data: Device[]; meta: PageMeta }>("/devices", { query }),
  device: (id: string) => request<DeviceDetail>(`/devices/${id}`),
  registerDevice: (body: {
    name: string;
    type: string;
    room_id?: string | null;
    firmware_version?: string;
    capabilities: Array<{
      capability: string;
      data_type: string;
      unit?: string;
      access: string;
      label: string;
      config?: Record<string, unknown>;
    }>;
  }) => request<DeviceCreated>("/devices", { method: "POST", body }),
  updateDevice: (
    id: string,
    body: Partial<{ name: string; type: string; room_id: string | null; firmware_version: string }>,
  ) => request<Device>(`/devices/${id}`, { method: "PATCH", body }),
  deleteDevice: (id: string) => request<void>(`/devices/${id}`, { method: "DELETE" }),

  capability: (deviceId: string, capability: string) =>
    request<CapabilityState>(`/devices/${deviceId}/capabilities/${capability}`),
  writeCapability: (deviceId: string, capability: string, value: unknown) =>
    request<{ request_id: string; published_topic: string; audit_id: string }>(
      `/devices/${deviceId}/capabilities/${capability}`,
      { method: "POST", body: { value } },
    ),
  readings: (deviceId: string, capability: string, query: Query) =>
    request<ReadingsResponse>(
      `/devices/${deviceId}/capabilities/${capability}/readings`,
      { query },
    ),

  scenes: () => request<{ data: Scene[] }>("/scenes"),
  createScene: (body: {
    name: string;
    icon?: string;
    description?: string;
    actions: Array<{ device_id: string; capability: string; payload: { value: unknown }; sort_order?: number }>;
  }) => request<Scene>("/scenes", { method: "POST", body }),
  updateScene: (
    id: string,
    body: Partial<{
      name: string;
      icon: string;
      description: string;
      actions: Array<{ device_id: string; capability: string; payload: { value: unknown }; sort_order?: number }>;
    }>,
  ) => request<Scene>(`/scenes/${id}`, { method: "PATCH", body }),
  deleteScene: (id: string) => request<void>(`/scenes/${id}`, { method: "DELETE" }),
  executeScene: (id: string) =>
    request<SceneExecutionResult>(`/scenes/${id}/execute`, { method: "POST" }),

  auditLog: (query?: Query) =>
    request<{ data: AuditEntry[]; meta: PageMeta }>("/audit-log", { query }),
  systemMetrics: () => request<SystemMetrics>("/system/metrics"),
  weather: () => request<Weather>("/weather"),
  aiUsage: (query?: Query) =>
    request<{ data: Array<AiUsageEntry | AiUsageAggregate>; meta: PageMeta }>(
      "/ai/usage",
      { query },
    ),

  dashboardLayout: () =>
    request<{ data: DashboardWidgetInstance[] }>("/dashboard/layout"),
  saveDashboardLayout: (widgets: DashboardWidgetInstance[]) =>
    request<{ data: DashboardWidgetInstance[] }>("/dashboard/layout", {
      method: "PUT",
      body: { widgets },
    }),
};
