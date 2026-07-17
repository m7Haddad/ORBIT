"use client";

/* Remote widget — button grid from the capability's config.values (write-only
 * enum, e.g. ir_command). No state topic: each press is a fire-and-forget
 * command whose record is the audit log. */

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  MonitorPlay,
  Power,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import type { WidgetProps } from "@/config/widgets.config";
import { useCapabilityWrite } from "@/lib/hooks";
import { cn } from "@/lib/cn";

const commandIcons: Record<string, LucideIcon> = {
  power: Power,
  vol_up: ChevronUp,
  vol_down: ChevronDown,
  mute: VolumeX,
  input_hdmi1: MonitorPlay,
  input_hdmi2: MonitorPlay,
};

export default function RemoteWidget(props: WidgetProps) {
  const writer = useCapabilityWrite(props.source);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const values = (props.context.capabilityConfig?.values ?? []) as string[];

  if (values.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-tertiary">
        No commands configured
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-3 content-center gap-2">
      {values.map((command) => {
        const Icon = commandIcons[command];
        return (
          <button
            key={command}
            disabled={props.editing}
            onClick={() => {
              setLastSent(command);
              writer.write(command);
              setTimeout(() => setLastSent(null), 600);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-md border",
              "border-subtle bg-surface-2 py-2.5 text-secondary",
              "transition-all duration-[var(--duration-fast)]",
              "hover:border-strong hover:text-primary active:scale-95",
              lastSent === command && "border-strong bg-accent-muted text-accent",
            )}
          >
            {Icon && <Icon size={15} />}
            <span className="text-[10px] font-medium">
              {command.replace(/_/g, " ")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
