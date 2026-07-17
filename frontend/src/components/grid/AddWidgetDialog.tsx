"use client";

/* Widget picker: enumerates every valid (manifest × source) pairing from data
 * already in the cache. The grid refuses source kinds a manifest didn't
 * declare — enforced here at the only place instances are created. The hermes
 * manifest stays hidden until its backing service exists (Stage 6). */

import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/misc";
import {
  manifestForType,
  widgetRegistry,
  type WidgetSource,
} from "@/config/widgets.config";
import { useDevicesDetailed, useScenes } from "@/lib/hooks";
import type { DashboardWidgetInstance } from "@/lib/types";

const HIDDEN_TYPES = new Set(["hermes"]);

interface Candidate {
  key: string;
  widgetType: string;
  label: string;
  sublabel: string;
  source: WidgetSource;
}

export function AddWidgetDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (instance: Omit<DashboardWidgetInstance, "position">) => void;
}) {
  const { devices } = useDevicesDetailed();
  const scenes = useScenes();
  const [filter, setFilter] = useState("");

  const candidates = useMemo(() => {
    const list: Candidate[] = [];
    for (const manifest of widgetRegistry) {
      if (HIDDEN_TYPES.has(manifest.type)) continue;
      if (manifest.sourceKinds.includes("device")) {
        for (const device of devices) {
          for (const capability of device.capabilities) {
            if (!manifest.capabilities?.includes(capability.capability)) continue;
            list.push({
              key: `${manifest.type}:${device.id}:${capability.capability}`,
              widgetType: manifest.type,
              label: `${capability.label} · ${device.name}`,
              sublabel: manifest.displayName,
              source: {
                kind: "device",
                deviceId: device.id,
                capability: capability.capability,
              },
            });
          }
        }
      }
      if (manifest.sourceKinds.includes("weather")) {
        list.push({
          key: "weather",
          widgetType: manifest.type,
          label: "Weather",
          sublabel: manifest.displayName,
          source: { kind: "weather" },
        });
      }
      if (manifest.sourceKinds.includes("system")) {
        list.push({
          key: "system",
          widgetType: manifest.type,
          label: "System Status",
          sublabel: manifest.displayName,
          source: { kind: "system" },
        });
      }
      if (manifest.sourceKinds.includes("scene")) {
        for (const scene of scenes.data?.data ?? []) {
          list.push({
            key: `scene:${scene.id}`,
            widgetType: manifest.type,
            label: scene.name,
            sublabel: "Scene",
            source: { kind: "scene", sceneId: scene.id },
          });
        }
      }
    }
    const query = filter.trim().toLowerCase();
    return query
      ? list.filter((c) =>
          `${c.label} ${c.sublabel}`.toLowerCase().includes(query),
        )
      : list;
  }, [devices, scenes.data, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add widget">
        <Input
          autoFocus
          placeholder="Filter widgets…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-3"
        />
        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {candidates.length === 0 && (
            <p className="py-8 text-center text-xs text-tertiary">
              Nothing matches — register devices or create scenes first.
            </p>
          )}
          {candidates.map((candidate) => (
            <div
              key={candidate.key}
              className="flex items-center gap-3 rounded-md border border-subtle px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-primary">{candidate.label}</p>
                <p className="text-[11px] text-tertiary">{candidate.sublabel}</p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const manifest = manifestForType(candidate.widgetType)!;
                  onAdd({
                    widget_type: candidate.widgetType,
                    source: candidate.source,
                    size: manifest.defaultSize,
                    title_override: null,
                  });
                  onOpenChange(false);
                }}
              >
                Add
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
