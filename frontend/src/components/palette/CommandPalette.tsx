"use client";

/* ⌘K command palette (docs/specs/command-palette.md). Index built entirely
 * from the query cache — opening costs no network. Commands are the SAME
 * REST calls the widgets make: zero new endpoints, zero new logic, optimistic
 * feedback in the row. Automation authoring is an explicit non-goal. */

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BotMessageSquare,
  Cpu,
  LayoutGrid,
  Moon,
  Power,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { usePalette } from "@/components/palette/palette-context";
import { iconFor } from "@/components/shell/icons";
import { api } from "@/lib/api";
import { useDevicesDetailed, useRooms, useScenes } from "@/lib/hooks";
import { selectCap, useRealtime } from "@/lib/realtime";
import { THEMES, useTheme, type Theme } from "@/lib/theme";
import { Badge } from "@/components/ui/misc";

const RECENTS_KEY = "orbit-palette-recents";

function loadRecents(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  const next = [id, ...loadRecents().filter((entry) => entry !== id)].slice(0, 5);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export function CommandPalette() {
  const { isOpen } = usePalette();
  // Mounted fresh on every open: query/recents state initialises cleanly with
  // no reset effects, and closed palettes cost nothing.
  if (!isOpen) return null;
  return <PaletteDialog />;
}

function PaletteDialog() {
  const { close } = usePalette();
  const router = useRouter();
  const rooms = useRooms();
  const scenes = useScenes();
  const { devices } = useDevicesDetailed();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [sceneStatus, setSceneStatus] = useState<Record<string, string>>({});
  const [recents] = useState<string[]>(() => loadRecents());

  function navigate(id: string, href: string) {
    pushRecent(id);
    close();
    router.push(href);
  }

  const powerDevices = useMemo(
    () =>
      devices.flatMap((device) => {
        const power = device.capabilities.find(
          (capability) =>
            capability.capability === "power" && capability.access === "read_write",
        );
        return power ? [{ device, power }] : [];
      }),
    [devices],
  );

  async function runScene(sceneId: string) {
    pushRecent(`scene:${sceneId}`);
    setSceneStatus((current) => ({ ...current, [sceneId]: "Running…" }));
    try {
      const result = await api.executeScene(sceneId);
      const sent = result.results.filter((r) => r.status === "published").length;
      const offline = result.results.filter(
        (r) => r.status === "skipped_offline",
      ).length;
      setSceneStatus((current) => ({
        ...current,
        [sceneId]: offline ? `${sent} sent · ${offline} offline` : `${sent} sent`,
      }));
    } catch {
      setSceneStatus((current) => ({ ...current, [sceneId]: "failed" }));
    }
    setTimeout(
      () =>
        setSceneStatus((current) => {
          const next = { ...current };
          delete next[sceneId];
          return next;
        }),
      2500,
    );
  }

  const pages = [
    { id: "page:dashboard", label: "Dashboard", href: "/", icon: LayoutGrid },
    { id: "page:devices", label: "Devices", href: "/devices", icon: Cpu },
    { id: "page:scenes", label: "Scenes", href: "/scenes", icon: Sparkles },
    { id: "page:audit", label: "Audit Log", href: "/audit", icon: Activity },
    { id: "page:ai-usage", label: "AI Usage", href: "/ai-usage", icon: BarChart3 },
    { id: "page:settings", label: "Settings", href: "/settings", icon: Settings },
  ];

  const isHermesQuery = query.startsWith("?");

  return (
    <Command.Dialog
      open
      onOpenChange={(open) => !open && close()}
      label="Command palette"
      shouldFilter={!isHermesQuery}
      className="material-overlay fixed left-1/2 top-[16vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-subtle shadow-overlay"
    >
      <div className="flex items-center gap-2.5 border-b border-subtle px-4">
        <Search size={15} className="shrink-0 text-tertiary" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search rooms, devices, scenes… (? asks Hermes)"
          className="h-12 w-full bg-transparent text-sm text-primary outline-none placeholder:text-tertiary"
        />
      </div>

      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        {isHermesQuery ? (
          <div className="flex items-start gap-3 rounded-md bg-surface-2 p-4">
            <BotMessageSquare size={16} className="mt-0.5 shrink-0 text-tertiary" />
            <div>
              <p className="text-sm text-primary">Ask Hermes</p>
              <p className="mt-0.5 text-xs text-tertiary">
                The assistant comes online in Stage 6 — this prefix will send
                &ldquo;{query.slice(1).trim() || "…"}&rdquo; straight to it.
              </p>
            </div>
          </div>
        ) : (
          <>
            <Command.Empty className="py-10 text-center text-xs text-tertiary">
              No matches.
            </Command.Empty>

            {query === "" && recents.length > 0 && (
              <Command.Group heading="Suggested" className={groupClass}>
                {recents.map((id) => {
                  const page = pages.find((entry) => entry.id === id);
                  if (page) {
                    return (
                      <Row
                        key={id}
                        icon={page.icon}
                        label={page.label}
                        onSelect={() => navigate(page.id, page.href)}
                      />
                    );
                  }
                  if (id.startsWith("scene:")) {
                    const scene = scenes.data?.data.find(
                      (entry) => `scene:${entry.id}` === id,
                    );
                    if (scene) {
                      return (
                        <Row
                          key={id}
                          icon={Sparkles}
                          label={scene.name}
                          sublabel={sceneStatus[scene.id] ?? "Run scene"}
                          onSelect={() => void runScene(scene.id)}
                        />
                      );
                    }
                  }
                  return null;
                })}
              </Command.Group>
            )}

            <Command.Group heading="Navigate" className={groupClass}>
              {rooms.data?.data.map((room) => {
                const Icon = iconFor(room.icon);
                return (
                  <Row
                    key={room.id}
                    icon={Icon}
                    label={room.name}
                    sublabel={`${room.device_count ?? 0} devices`}
                    keywords={["room"]}
                    onSelect={() =>
                      navigate(`room:${room.slug}`, `/rooms/${room.slug}`)
                    }
                  />
                );
              })}
              {pages.map((page) => (
                <Row
                  key={page.id}
                  icon={page.icon}
                  label={page.label}
                  onSelect={() => navigate(page.id, page.href)}
                />
              ))}
            </Command.Group>

            {powerDevices.length > 0 && (
              <Command.Group heading="Devices" className={groupClass}>
                {powerDevices.map((entry) => (
                  <DeviceToggleRow
                    key={entry.device.id}
                    deviceId={entry.device.id}
                    name={entry.device.name}
                    onPerformed={() => pushRecent(`device:${entry.device.id}:power`)}
                  />
                ))}
              </Command.Group>
            )}

            {(scenes.data?.data.length ?? 0) > 0 && (
              <Command.Group heading="Scenes" className={groupClass}>
                {scenes.data!.data.map((scene) => (
                  <Row
                    key={scene.id}
                    icon={Sparkles}
                    label={scene.name}
                    sublabel={sceneStatus[scene.id] ?? scene.description ?? "Run scene"}
                    keywords={["run", "scene"]}
                    onSelect={() => void runScene(scene.id)}
                  />
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Settings" className={groupClass}>
              {THEMES.map((entry) => (
                <Row
                  key={entry}
                  icon={Moon}
                  label={`Theme: ${entry[0].toUpperCase()}${entry.slice(1)}`}
                  keywords={["theme", "appearance"]}
                  onSelect={() => {
                    pushRecent(`theme:${entry}`);
                    setTheme(entry as Theme);
                    close();
                  }}
                />
              ))}
            </Command.Group>
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

const groupClass =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-tertiary";

function Row({
  icon: Icon,
  label,
  sublabel,
  keywords,
  onSelect,
  trailing,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  sublabel?: string;
  keywords?: string[];
  onSelect: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <Command.Item
      value={`${label} ${keywords?.join(" ") ?? ""}`}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm text-secondary data-[selected=true]:bg-surface-2 data-[selected=true]:text-primary"
    >
      <Icon size={15} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {sublabel && (
        <span className="shrink-0 text-[11px] text-tertiary">{sublabel}</span>
      )}
      {trailing}
    </Command.Item>
  );
}

/** Toggle command row: live state chip from the realtime store, optimistic
 * flip, WS reconciliation — identical semantics to the toggle widget. */
function DeviceToggleRow({
  deviceId,
  name,
  onPerformed,
}: {
  deviceId: string;
  name: string;
  onPerformed: () => void;
}) {
  const entry = useRealtime(selectCap(deviceId, "power"));
  const availability = useRealtime((state) => state.availability[deviceId]);
  const { setPending, rollbackPending } = useRealtime.getState();
  const [failed, setFailed] = useState(false);

  const on = (entry?.pending ? entry.pending.value : entry?.value) === true;
  const offline = availability?.online === false;

  async function toggle() {
    onPerformed();
    const next = !on;
    setPending(deviceId, "power", next);
    try {
      await api.writeCapability(deviceId, "power", next);
    } catch {
      rollbackPending(deviceId, "power");
      setFailed(true);
      setTimeout(() => setFailed(false), 1500);
    }
  }

  return (
    <Command.Item
      value={`${name} toggle power light switch`}
      onSelect={() => void toggle()}
      className={`flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm text-secondary data-[selected=true]:bg-surface-2 data-[selected=true]:text-primary ${failed ? "animate-[orbit-shake_320ms_ease-in-out]" : ""}`}
    >
      <Power size={15} className={on ? "text-accent" : undefined} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {failed ? (
        <Badge tone="danger">offline</Badge>
      ) : offline ? (
        <Badge tone="danger">offline</Badge>
      ) : (
        <Badge tone={on ? "accent" : "neutral"}>
          {entry?.pending ? "…" : on ? "On" : "Off"}
        </Badge>
      )}
    </Command.Item>
  );
}
