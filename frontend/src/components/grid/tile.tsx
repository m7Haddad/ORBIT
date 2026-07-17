"use client";

/* Tile chrome + lazy widget mounting. The chrome owns the title row, offline
 * dot, and edit-mode affordances; the widget body owns nothing but its data
 * presentation. Grid spans are driven by WidgetSize (grid units, not pixels). */

import { lazy, Suspense, type ComponentType } from "react";
import { GripVertical, X } from "lucide-react";
import {
  widgetRegistry,
  type WidgetProps,
  type WidgetSize,
} from "@/config/widgets.config";
import { useRealtime, selectAvailability } from "@/lib/realtime";
import { cn } from "@/lib/cn";

export const sizeClasses: Record<WidgetSize, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x1": "col-span-2 row-span-1",
  "2x2": "col-span-2 row-span-2",
  "4x2": "col-span-2 row-span-2 md:col-span-4",
};

// Lazy components are created once at module load (stable identities — never
// during render), one per registry entry.
const lazyComponents: Record<string, ComponentType<WidgetProps>> =
  Object.fromEntries(
    widgetRegistry.map((manifest) => [
      manifest.type,
      lazy(manifest.component) as ComponentType<WidgetProps>,
    ]),
  );

export function SkeletonTile({ size }: { size: WidgetSize }) {
  return (
    <div
      className={cn(
        "material rounded-lg border border-subtle p-4 shadow-tile",
        sizeClasses[size],
      )}
    >
      <div className="skeleton mb-3 h-3.5 w-1/2" />
      <div className="skeleton h-8 w-2/3" />
      {(size === "2x2" || size === "4x2") && (
        <div className="skeleton mt-4 h-16" />
      )}
    </div>
  );
}

export function WidgetTile({
  type,
  widget,
  editing,
  onRemove,
  dragHandleProps,
  dragging,
  bare,
}: {
  type: string;
  widget: WidgetProps;
  editing?: boolean;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
  dragging?: boolean;
  /** Fill the parent instead of claiming grid spans (parent owns placement). */
  bare?: boolean;
}) {
  const Component = lazyComponents[type] ?? null;
  const deviceId = widget.source.kind === "device" ? widget.source.deviceId : null;
  const availability = useRealtime(
    deviceId ? selectAvailability(deviceId) : () => undefined,
  );
  const offline = deviceId !== null && availability?.online === false;

  if (!Component) return null;

  return (
    <div
      className={cn(
        "material group relative flex flex-col overflow-hidden rounded-lg border",
        "border-subtle p-4 shadow-tile transition-shadow duration-[var(--duration-base)]",
        "hover:shadow-tile-hover",
        bare ? "h-full" : sizeClasses[widget.size],
        dragging && "opacity-60",
        editing && "select-none",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-secondary">
            {widget.context.title}
          </p>
          {widget.context.roomSlug && (
            <p className="truncate text-[11px] capitalize text-tertiary">
              {widget.context.roomSlug.replace(/-/g, " ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {offline && (
            <span
              title="Device offline"
              className="h-2 w-2 rounded-full bg-danger"
            />
          )}
          {editing && (
            <>
              <button
                aria-label="Remove widget"
                onClick={onRemove}
                className="rounded-sm p-1 text-tertiary hover:bg-danger-muted hover:text-danger"
              >
                <X size={13} />
              </button>
              <span
                {...dragHandleProps}
                className="cursor-grab touch-none rounded-sm p-1 text-tertiary hover:bg-surface-2 active:cursor-grabbing"
              >
                <GripVertical size={13} />
              </span>
            </>
          )}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1", editing && "pointer-events-none opacity-80")}>
        <Suspense fallback={<div className="skeleton h-full min-h-8" />}>
          <Component {...widget} editing={editing} />
        </Suspense>
      </div>
    </div>
  );
}

