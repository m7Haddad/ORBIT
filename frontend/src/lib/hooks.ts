/* Contract hooks (widget-contract.md §3). Widgets get ALL live data through
 * these — no private fetches, no private sockets. */

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { selectAvailability, selectCap, useRealtime } from "@/lib/realtime";
import type { WidgetSource } from "@/config/widgets.config";

const WRITE_CONFIRM_TIMEOUT_MS = 10_000;

/** Live value + availability for a device-bound capability. */
export function useCapabilityState(source: WidgetSource) {
  const device = source.kind === "device" ? source : null;
  const query = useQuery({
    queryKey: ["capability", device?.deviceId, device?.capability],
    queryFn: () => api.capability(device!.deviceId, device!.capability),
    enabled: !!device,
  });

  const hydrate = useRealtime((state) => state.hydrateCapability);
  useEffect(() => {
    if (device && query.data) {
      hydrate(
        device.deviceId,
        device.capability,
        query.data.value,
        query.data.reported_at,
      );
    }
  }, [device, query.data, hydrate]);

  const entry = useRealtime(
    device ? selectCap(device.deviceId, device.capability) : () => undefined,
  );
  const availability = useRealtime(
    device ? selectAvailability(device.deviceId) : () => undefined,
  );

  const value = entry?.pending ? entry.pending.value : entry?.value;
  return {
    value,
    reportedAt: entry?.reportedAt ?? null,
    pending: !!entry?.pending,
    failed: !!entry?.failedAt,
    online: availability?.online,
    loading: query.isLoading,
    definition: query.data ?? null,
  };
}

/** Optimistic capability write: flip now, reconcile on WS, roll back on error
 * or confirmation timeout. */
export function useCapabilityWrite(source: WidgetSource) {
  const device = source.kind === "device" ? source : null;
  const { setPending, rollbackPending, clearFailure } = useRealtime.getState();

  const mutation = useMutation({
    mutationFn: async (value: unknown) => {
      if (!device) throw new Error("not a device source");
      setPending(device.deviceId, device.capability, value);
      try {
        const result = await api.writeCapability(
          device.deviceId,
          device.capability,
          value,
        );
        // Safety net: if the device never echoes state, revert instead of
        // showing a stuck optimistic value.
        setTimeout(() => {
          const entry = useRealtime.getState().caps[
            `${device.deviceId}/${device.capability}`
          ];
          if (entry?.pending && Date.now() - entry.pending.since >= WRITE_CONFIRM_TIMEOUT_MS) {
            rollbackPending(device.deviceId, device.capability);
          }
        }, WRITE_CONFIRM_TIMEOUT_MS);
        return result;
      } catch (error) {
        rollbackPending(device.deviceId, device.capability);
        throw error;
      }
    },
  });

  const dismissFailure = useCallback(() => {
    if (device) clearFailure(device.deviceId, device.capability);
  }, [device, clearFailure]);

  const error = mutation.error as ApiError | null;
  return {
    write: mutation.mutate,
    writing: mutation.isPending,
    error,
    offlineRejected: error instanceof ApiError && error.code === "device_offline",
    dismissFailure,
  };
}

export function useCapabilityHistory(
  source: WidgetSource,
  range: { from: string; to?: string; interval?: string; aggregate?: string },
) {
  const device = source.kind === "device" ? source : null;
  return useQuery({
    queryKey: ["readings", device?.deviceId, device?.capability, range],
    queryFn: () =>
      api.readings(device!.deviceId, device!.capability, {
        from: range.from,
        to: range.to,
        interval: range.interval,
        aggregate: range.aggregate,
      }),
    enabled: !!device,
    staleTime: 30_000,
  });
}

export function useWeather() {
  return useQuery({
    queryKey: ["weather"],
    queryFn: api.weather,
    refetchInterval: 5 * 60_000,
  });
}

export function useSystemMetrics() {
  return useQuery({
    queryKey: ["system-metrics"],
    queryFn: api.systemMetrics,
    refetchInterval: 10_000,
  });
}

export function useRooms() {
  return useQuery({ queryKey: ["rooms"], queryFn: api.rooms, staleTime: 60_000 });
}

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: () => api.devices({ limit: 500 }),
    staleTime: 30_000,
  });
}

export function useDeviceDetail(deviceId: string | null) {
  return useQuery({
    queryKey: ["device", deviceId],
    queryFn: () => api.device(deviceId!),
    enabled: !!deviceId,
  });
}

/** Every device WITH its capabilities — the shell's context-resolution source
 * (titles, units, config, access) so widgets never re-fetch definitions.
 * Home-scale N+1 (a handful of cached detail fetches), refreshed on demand. */
export function useDevicesDetailed() {
  const devices = useDevices();
  const ids = devices.data?.data.map((device) => device.id) ?? [];
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["device", id],
      queryFn: () => api.device(id),
      staleTime: 60_000,
    })),
  });
  return {
    loading: devices.isLoading || details.some((query) => query.isLoading),
    devices: details
      .map((query) => query.data)
      .filter((detail): detail is NonNullable<typeof detail> => !!detail),
  };
}

export function useScenes() {
  return useQuery({ queryKey: ["scenes"], queryFn: api.scenes, staleTime: 60_000 });
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: Infinity });
}

export function useDashboardLayout() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: api.dashboardLayout,
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: api.saveDashboardLayout,
    onSuccess: (data) => queryClient.setQueryData(["dashboard-layout"], data),
  });
  return { ...query, save };
}
