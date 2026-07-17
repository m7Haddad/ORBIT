"use client";

/* Room view: live tiles for every capability of every device in the room —
 * derived (default widget per capability), not user-arranged; the dashboard
 * is the customizable canvas. */

import { use } from "react";
import { Cpu } from "lucide-react";
import { SkeletonTile, WidgetTile, sizeClasses } from "@/components/grid/tile";
import {
  defaultWidgetFor,
  manifestForType,
} from "@/config/widgets.config";
import { useDevicesDetailed, useRooms } from "@/lib/hooks";
import { useRealtime } from "@/lib/realtime";
import { Badge } from "@/components/ui/misc";

export default function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const rooms = useRooms();
  const { devices, loading } = useDevicesDetailed();
  const availability = useRealtime((state) => state.availability);

  const room = rooms.data?.data.find((entry) => entry.slug === slug);
  const roomDevices = devices.filter((device) => device.room_id === room?.id);

  if (loading || rooms.isLoading) {
    return (
      <div className="grid auto-rows-[8.5rem] grid-cols-2 gap-4 md:grid-cols-4">
        {(["1x1", "1x1", "2x1"] as const).map((size, index) => (
          <SkeletonTile key={index} size={size} />
        ))}
      </div>
    );
  }

  if (!room) {
    return <p className="text-sm text-secondary">Room not found.</p>;
  }

  if (roomDevices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle py-24 text-center">
        <Cpu size={28} className="mb-3 text-tertiary" />
        <p className="text-sm font-medium text-primary">No devices in {room.name}</p>
        <p className="mt-1 text-xs text-secondary">
          Register a device and assign it to this room.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {roomDevices.map((device) => {
        const online = availability[device.id]?.online ?? device.is_online;
        return (
          <section key={device.id}>
            <div className="mb-3 flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-primary">{device.name}</h2>
              <Badge tone={online ? "success" : "danger"}>
                {online ? "online" : "offline"}
              </Badge>
              <span className="text-[11px] text-tertiary">{device.type}</span>
            </div>
            <div className="grid auto-rows-[8.5rem] grid-cols-2 gap-4 md:grid-cols-4">
              {device.capabilities.map((capability) => {
                const type = defaultWidgetFor[capability.capability];
                const manifest = type ? manifestForType(type) : undefined;
                if (!type || !manifest) return null;
                return (
                  <div
                    key={capability.id}
                    className={sizeClasses[manifest.defaultSize]}
                  >
                    <WidgetTile
                      bare
                      type={type}
                      widget={{
                        instanceId: capability.id,
                        source: {
                          kind: "device",
                          deviceId: device.id,
                          capability: capability.capability,
                        },
                        size: manifest.defaultSize,
                        context: {
                          title: capability.label,
                          roomSlug: room.slug,
                          unit: capability.unit,
                          capabilityConfig: capability.config,
                          access: capability.access,
                        },
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
