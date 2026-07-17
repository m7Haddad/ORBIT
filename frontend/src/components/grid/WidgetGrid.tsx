"use client";

/* The dashboard grid: renders persisted widget instances, resolves their
 * presentation context (shell's job per the contract), supports edit mode
 * (dnd-kit reorder, remove, add) and saves the layout atomically on exit. */

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LayoutGrid, Check, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddWidgetDialog } from "@/components/grid/AddWidgetDialog";
import { SkeletonTile, WidgetTile, sizeClasses } from "@/components/grid/tile";
import { Button } from "@/components/ui/button";
import {
  defaultWidgetFor,
  manifestForType,
  type WidgetProps,
  type WidgetSource,
} from "@/config/widgets.config";
import { useDashboardLayout, useDevicesDetailed, useRooms, useScenes } from "@/lib/hooks";
import type { DashboardWidgetInstance, DeviceDetail, Room, Scene } from "@/lib/types";

let localId = 0;
const nextLocalId = () => `local-${++localId}`;

export function resolveContext(
  instance: DashboardWidgetInstance,
  devices: DeviceDetail[],
  rooms: Room[],
  scenes: Scene[],
): WidgetProps["context"] {
  const source = instance.source;
  if (source.kind === "device") {
    const device = devices.find((d) => d.id === source.deviceId);
    const capability = device?.capabilities.find(
      (cap) => cap.capability === source.capability,
    );
    const room = rooms.find((r) => r.id === device?.room_id);
    return {
      title: instance.title_override ?? capability?.label ?? source.capability,
      roomSlug: room?.slug,
      unit: capability?.unit ?? null,
      capabilityConfig: capability?.config,
      access: capability?.access,
    };
  }
  if (source.kind === "scene") {
    const scene = scenes.find((s) => s.id === source.sceneId);
    return { title: instance.title_override ?? scene?.name ?? "Scene" };
  }
  const fixed = { weather: "Weather", system: "System", hermes: "Hermes" }[source.kind];
  return { title: instance.title_override ?? fixed };
}

/** Default layout for first run: every capability's default widget + weather + system. */
export function buildDefaultLayout(devices: DeviceDetail[]): DashboardWidgetInstance[] {
  const widgets: DashboardWidgetInstance[] = [];
  for (const device of devices) {
    for (const capability of device.capabilities) {
      const type = defaultWidgetFor[capability.capability];
      if (!type) continue;
      const manifest = manifestForType(type);
      if (!manifest) continue;
      widgets.push({
        widget_type: type,
        source: {
          kind: "device",
          deviceId: device.id,
          capability: capability.capability,
        },
        size: manifest.defaultSize,
        position: widgets.length,
        title_override: null,
      });
    }
  }
  widgets.push({
    widget_type: "weather",
    source: { kind: "weather" },
    size: "2x1",
    position: widgets.length,
    title_override: null,
  });
  widgets.push({
    widget_type: "system",
    source: { kind: "system" },
    size: "2x2",
    position: widgets.length,
    title_override: null,
  });
  return widgets;
}

export function WidgetGrid() {
  const layout = useDashboardLayout();
  const { devices, loading: devicesLoading } = useDevicesDetailed();
  const rooms = useRooms();
  const scenes = useScenes();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashboardWidgetInstance[] | null>(null);
  const [adding, setAdding] = useState(false);
  const seededRef = useRef(false);

  // First-run auto-seed: empty layout + known devices → defaults, persisted.
  useEffect(() => {
    if (
      !seededRef.current &&
      layout.data &&
      layout.data.data.length === 0 &&
      !devicesLoading &&
      devices.length > 0
    ) {
      seededRef.current = true;
      layout.save.mutate(buildDefaultLayout(devices));
    }
  }, [layout.data, devices, devicesLoading, layout.save]);

  const saved = useMemo(
    () =>
      (layout.data?.data ?? []).map((widget) => ({
        ...widget,
        id: widget.id ?? nextLocalId(),
      })),
    [layout.data],
  );
  const widgets = draft ?? saved;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      const list = current ?? saved;
      const from = list.findIndex((w) => w.id === active.id);
      const to = list.findIndex((w) => w.id === over.id);
      return arrayMove(list, from, to).map((w, index) => ({ ...w, position: index }));
    });
  }

  function exitEditing() {
    if (draft) layout.save.mutate(draft.map((w, i) => ({ ...w, position: i })));
    setDraft(null);
    setEditing(false);
  }

  if (layout.isLoading || (devicesLoading && saved.length === 0)) {
    return (
      <div className="grid auto-rows-[8.5rem] grid-cols-2 gap-4 md:grid-cols-4">
        {(["1x1", "1x1", "2x1", "2x2", "1x1", "2x1"] as const).map((size, i) => (
          <SkeletonTile key={i} size={size} />
        ))}
      </div>
    );
  }

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle py-24 text-center">
        <LayoutGrid size={28} className="mb-3 text-tertiary" />
        <p className="text-sm font-medium text-primary">Your dashboard is empty</p>
        <p className="mt-1 max-w-xs text-xs text-secondary">
          Register a device or add a widget to get started.
        </p>
        <Button className="mt-5" variant="primary" onClick={() => setAdding(true)}>
          <Plus size={15} /> Add widget
        </Button>
        <AddWidgetDialog
          open={adding}
          onOpenChange={setAdding}
          onAdd={(instance) => {
            layout.save.mutate([
              ...saved,
              { ...instance, position: saved.length },
            ]);
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-2">
        {editing && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add widget
          </Button>
        )}
        <Button
          size="sm"
          variant={editing ? "primary" : "ghost"}
          onClick={editing ? exitEditing : () => setEditing(true)}
        >
          {editing ? (
            <>
              <Check size={14} /> Done
            </>
          ) : (
            <>
              <Pencil size={13} /> Edit
            </>
          )}
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={widgets.map((w) => w.id!)}
          strategy={rectSortingStrategy}
        >
          <div className="grid auto-rows-[8.5rem] grid-cols-2 gap-4 md:grid-cols-4">
            {widgets.map((instance) =>
              // Device tiles wait for their context (label/unit/config) —
              // skeleton beats a lowercase-capability title popping in.
              devicesLoading && instance.source.kind === "device" ? (
                <SkeletonTile key={instance.id} size={instance.size} />
              ) : (
                <SortableTile
                  key={instance.id}
                  instance={instance}
                  editing={editing}
                  context={resolveContext(
                    instance,
                    devices,
                    rooms.data?.data ?? [],
                    scenes.data?.data ?? [],
                  )}
                  onRemove={() =>
                    setDraft((current) =>
                      (current ?? saved).filter((w) => w.id !== instance.id),
                    )
                  }
                />
              ),
            )}
          </div>
        </SortableContext>
      </DndContext>

      <AddWidgetDialog
        open={adding}
        onOpenChange={setAdding}
        onAdd={(instance) => {
          setDraft((current) => [
            ...(current ?? saved),
            { ...instance, id: nextLocalId(), position: (current ?? saved).length },
          ]);
        }}
      />
    </>
  );
}

function SortableTile({
  instance,
  context,
  editing,
  onRemove,
}: {
  instance: DashboardWidgetInstance;
  context: WidgetProps["context"];
  editing: boolean;
  onRemove: () => void;
}) {
  // dnd-kit's useSortable intentionally exposes live values + a ref callback
  // for the sorted node; the react-hooks refs rule can't model that API.
  /* eslint-disable react-hooks/refs */
  const sortable = useSortable({ id: instance.id!, disabled: !editing });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={sizeClasses[instance.size]}
    >
      <WidgetTile
        bare
        type={instance.widget_type}
        widget={{
          instanceId: instance.id!,
          source: instance.source as WidgetSource,
          size: instance.size,
          context,
        }}
        editing={editing}
        dragging={sortable.isDragging}
        onRemove={onRemove}
        dragHandleProps={{ ...sortable.attributes, ...sortable.listeners }}
      />
    </div>
  );
}
