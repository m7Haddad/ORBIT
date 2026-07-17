"use client";

/* Scenes: static macros (an ordered list of capability writes — never rules;
 * anything conditional lives in n8n). Create/edit/delete/run. */

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Plus, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useDevicesDetailed, useScenes } from "@/lib/hooks";
import type { Scene } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Input, Select } from "@/components/ui/misc";

interface ActionDraft {
  device_id: string;
  capability: string;
  value: string; // edited as text, coerced on save
}

export default function ScenesPage() {
  const scenes = useScenes();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Scene | "new" | null>(null);
  const [runResult, setRunResult] = useState<Record<string, string>>({});

  async function run(scene: Scene) {
    setRunResult((current) => ({ ...current, [scene.id]: "Running…" }));
    try {
      const result = await api.executeScene(scene.id);
      const sent = result.results.filter((r) => r.status === "published").length;
      const offline = result.results.filter((r) => r.status === "skipped_offline").length;
      setRunResult((current) => ({
        ...current,
        [scene.id]: offline ? `${sent} sent, ${offline} offline` : `${sent} sent`,
      }));
    } catch {
      setRunResult((current) => ({ ...current, [scene.id]: "failed" }));
    }
    setTimeout(
      () =>
        setRunResult((current) => {
          const next = { ...current };
          delete next[scene.id];
          return next;
        }),
      3000,
    );
  }

  async function remove(scene: Scene) {
    await api.deleteScene(scene.id);
    void queryClient.invalidateQueries({ queryKey: ["scenes"] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-secondary">
          Scenes run a fixed list of actions — schedules and triggers live in
          n8n.
        </p>
        <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
          <Plus size={14} /> New scene
        </Button>
      </div>

      {scenes.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      ) : (scenes.data?.data.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-subtle py-20 text-center">
          <Sparkles size={26} className="mb-3 text-tertiary" />
          <p className="text-sm font-medium text-primary">No scenes yet</p>
          <p className="mt-1 text-xs text-secondary">
            Bundle capability writes into one tap.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.data!.data.map((scene) => (
            <div
              key={scene.id}
              className="material flex items-center gap-3 rounded-lg border border-subtle p-4 shadow-tile"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-muted text-accent">
                <Sparkles size={15} />
              </span>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setEditing(scene)}
              >
                <p className="truncate text-sm font-medium text-primary">
                  {scene.name}
                </p>
                <p className="truncate text-[11px] text-tertiary">
                  {scene.description || `${scene.actions.length} action${scene.actions.length === 1 ? "" : "s"}`}
                </p>
              </button>
              {runResult[scene.id] && (
                <Badge tone="accent">{runResult[scene.id]}</Badge>
              )}
              <Button
                aria-label={`Run ${scene.name}`}
                size="icon"
                variant="ghost"
                onClick={() => void run(scene)}
              >
                <Play size={15} />
              </Button>
              <Button
                aria-label={`Delete ${scene.name}`}
                size="icon"
                variant="ghost"
                onClick={() => void remove(scene)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SceneEditor
          scene={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ["scenes"] });
          }}
        />
      )}
    </div>
  );
}

function SceneEditor({
  scene,
  onClose,
  onSaved,
}: {
  scene: Scene | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { devices } = useDevicesDetailed();
  const [name, setName] = useState(scene?.name ?? "");
  const [description, setDescription] = useState(scene?.description ?? "");
  const [actions, setActions] = useState<ActionDraft[]>(
    scene?.actions.map((action) => ({
      device_id: action.device_id,
      capability: action.capability,
      value: JSON.stringify(action.payload.value),
    })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const writable = useMemo(
    () =>
      devices.flatMap((device) =>
        device.capabilities
          .filter((capability) => capability.access !== "read")
          .map((capability) => ({
            device,
            capability,
            key: `${device.id}:${capability.capability}`,
          })),
      ),
    [devices],
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payloadActions = actions.map((action, index) => ({
        device_id: action.device_id,
        capability: action.capability,
        payload: { value: parseValue(action.value) },
        sort_order: index,
      }));
      if (scene) {
        await api.updateScene(scene.id, {
          name,
          description: description || undefined,
          actions: payloadActions,
        });
      } else {
        await api.createScene({
          name,
          description: description || undefined,
          actions: payloadActions,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={scene ? "Edit scene" : "New scene"} wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">
                Description
              </label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-secondary">
              Actions (run in order)
            </label>
            {actions.map((action, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  value={`${action.device_id}:${action.capability}`}
                  onChange={(event) => {
                    const [device_id, capability] = event.target.value.split(":");
                    setActions((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, device_id, capability } : entry,
                      ),
                    );
                  }}
                >
                  {writable.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.device.name} · {entry.capability.label}
                    </option>
                  ))}
                </Select>
                <Input
                  className="w-28"
                  value={action.value}
                  placeholder="true"
                  onChange={(event) =>
                    setActions((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, value: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Button
                  aria-label="Remove action"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setActions((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              disabled={writable.length === 0}
              onClick={() =>
                setActions((current) => [
                  ...current,
                  {
                    device_id: writable[0].device.id,
                    capability: writable[0].capability.capability,
                    value: "true",
                  },
                ])
              }
            >
              <Plus size={13} /> Add action
            </Button>
            {writable.length === 0 && (
              <p className="text-[11px] text-tertiary">
                No writable capabilities registered yet.
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-md bg-danger-muted px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            className="w-full"
            disabled={busy || !name.trim() || actions.length === 0}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save scene"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "true" → true, "22.5" → 22.5, '{"mode":"cool"}' → object, plain text stays text. */
function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
