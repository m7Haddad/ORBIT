/* Shared realtime store (widget-contract.md §3): REST-hydrated, WebSocket-
 * updated. Widgets subscribe through hooks; nobody opens private sockets or
 * fetch loops. Optimistic writes live here too, so the toggle path is:
 * setPending (instant UI) → WS capability.state (reconcile) OR error/timeout
 * (rollback + failure flash). */

import { create } from "zustand";

const capKey = (deviceId: string, capability: string) =>
  `${deviceId}/${capability}`;

export interface CapEntry {
  value: unknown;
  reportedAt: string | null;
  /** Optimistic value awaiting WS confirmation. */
  pending?: { value: unknown; since: number };
  /** Set briefly when a write fails — drives the danger affordance. */
  failedAt?: number;
}

interface RealtimeState {
  caps: Record<string, CapEntry>;
  availability: Record<string, { online: boolean; lastSeen: string | null }>;
  lastSceneExecution: { sceneId: string; slug: string; at: string } | null;
  wsConnected: boolean;

  hydrateCapability: (
    deviceId: string,
    capability: string,
    value: unknown,
    reportedAt: string | null,
  ) => void;
  applyCapabilityEvent: (event: {
    device_id: string;
    capability: string;
    value: unknown;
    recorded_at: string;
  }) => void;
  applyAvailabilityEvent: (event: {
    device_id: string;
    online: boolean;
    last_seen: string | null;
  }) => void;
  applySceneEvent: (event: { scene_id: string; scene_slug: string; executed_at: string }) => void;
  setPending: (deviceId: string, capability: string, value: unknown) => void;
  rollbackPending: (deviceId: string, capability: string) => void;
  clearFailure: (deviceId: string, capability: string) => void;
  setWsConnected: (connected: boolean) => void;
}

export const useRealtime = create<RealtimeState>((set) => ({
  caps: {},
  availability: {},
  lastSceneExecution: null,
  wsConnected: false,

  hydrateCapability: (deviceId, capability, value, reportedAt) =>
    set((state) => {
      const key = capKey(deviceId, capability);
      const existing = state.caps[key];
      // Never clobber newer WS data or a pending optimistic value with a
      // stale REST hydration.
      if (
        existing &&
        (existing.pending ||
          (existing.reportedAt && reportedAt && existing.reportedAt >= reportedAt))
      ) {
        return state;
      }
      return {
        caps: { ...state.caps, [key]: { ...existing, value, reportedAt } },
      };
    }),

  applyCapabilityEvent: (event) =>
    set((state) => {
      const key = capKey(event.device_id, event.capability);
      return {
        caps: {
          ...state.caps,
          // Confirmed state clears any pending optimistic value.
          [key]: { value: event.value, reportedAt: event.recorded_at },
        },
      };
    }),

  applyAvailabilityEvent: (event) =>
    set((state) => ({
      availability: {
        ...state.availability,
        [event.device_id]: { online: event.online, lastSeen: event.last_seen },
      },
    })),

  applySceneEvent: (event) =>
    set({
      lastSceneExecution: {
        sceneId: event.scene_id,
        slug: event.scene_slug,
        at: event.executed_at,
      },
    }),

  setPending: (deviceId, capability, value) =>
    set((state) => {
      const key = capKey(deviceId, capability);
      return {
        caps: {
          ...state.caps,
          [key]: {
            ...state.caps[key],
            pending: { value, since: Date.now() },
            failedAt: undefined,
          },
        },
      };
    }),

  rollbackPending: (deviceId, capability) =>
    set((state) => {
      const key = capKey(deviceId, capability);
      const entry = state.caps[key];
      if (!entry?.pending) return state;
      return {
        caps: {
          ...state.caps,
          [key]: { value: entry.value, reportedAt: entry.reportedAt, failedAt: Date.now() },
        },
      };
    }),

  clearFailure: (deviceId, capability) =>
    set((state) => {
      const key = capKey(deviceId, capability);
      const entry = state.caps[key];
      if (!entry?.failedAt) return state;
      return { caps: { ...state.caps, [key]: { ...entry, failedAt: undefined } } };
    }),

  setWsConnected: (connected) => set({ wsConnected: connected }),
}));

export function selectCap(deviceId: string, capability: string) {
  return (state: RealtimeState) => state.caps[capKey(deviceId, capability)];
}

export function selectAvailability(deviceId: string) {
  return (state: RealtimeState) => state.availability[deviceId];
}
