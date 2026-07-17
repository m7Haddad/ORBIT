"use client";

/* Climate widget — ac_control composite capability. Modes/setpoint/fan
 * constraints come from config.schema; every change writes the FULL state
 * object (composite capabilities report complete snapshots, capability-
 * catalog.md), optimistically. */

import { Fan, Flame, Minus, Plus, Power, Snowflake, Waves, type LucideIcon } from "lucide-react";
import type { WidgetProps } from "@/config/widgets.config";
import { useCapabilityState, useCapabilityWrite } from "@/lib/hooks";
import { cn } from "@/lib/cn";

interface AcState {
  mode: string;
  setpoint_c?: number;
  fan?: string;
}

interface AcSchema {
  mode?: string[];
  setpoint_c?: { min?: number; max?: number; step?: number };
  fan?: string[];
}

const modeIcons: Record<string, LucideIcon> = {
  off: Power,
  cool: Snowflake,
  heat: Flame,
  fan: Fan,
  dry: Waves,
};

export default function ClimateWidget(props: WidgetProps) {
  const state = useCapabilityState(props.source);
  const writer = useCapabilityWrite(props.source);
  const schema = (props.context.capabilityConfig?.schema ?? {}) as AcSchema;

  if (state.loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8" />
        <div className="skeleton h-14" />
      </div>
    );
  }

  const current: AcState =
    state.value && typeof state.value === "object"
      ? (state.value as AcState)
      : { mode: "off" };
  const offline = state.online === false;
  const modes = schema.mode ?? ["off", "cool", "heat", "fan", "dry"];
  const setpointRule = schema.setpoint_c ?? { min: 16, max: 30, step: 0.5 };
  const fans = schema.fan ?? ["auto", "low", "med", "high"];
  const setpoint = current.setpoint_c ?? 22;

  function apply(patch: Partial<AcState>) {
    writer.write({ ...current, setpoint_c: setpoint, fan: current.fan ?? "auto", ...patch });
  }

  const disabled = offline || props.editing;

  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex gap-1 rounded-md bg-surface-2 p-0.5">
        {modes.map((mode) => {
          const Icon = modeIcons[mode] ?? Fan;
          const active = current.mode === mode;
          return (
            <button
              key={mode}
              disabled={disabled}
              onClick={() => apply({ mode })}
              title={mode}
              className={cn(
                "flex flex-1 items-center justify-center rounded-sm py-1.5",
                "transition-colors duration-[var(--duration-fast)]",
                active
                  ? "bg-surface-1 text-accent shadow-tile"
                  : "text-tertiary hover:text-secondary",
                disabled && "opacity-50",
              )}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          aria-label="Lower setpoint"
          disabled={disabled || setpoint <= (setpointRule.min ?? 16)}
          onClick={() =>
            apply({ setpoint_c: Math.max(setpoint - (setpointRule.step ?? 0.5), setpointRule.min ?? 16) })
          }
          className="rounded-full border border-subtle p-2 text-secondary transition-colors hover:border-strong hover:text-primary disabled:opacity-40"
        >
          <Minus size={14} />
        </button>
        <p
          className={cn(
            "tabular-nums text-3xl font-semibold tracking-tight",
            current.mode === "off" ? "text-tertiary" : "text-primary",
            state.pending && "animate-pulse",
          )}
        >
          {setpoint.toFixed(1)}
          <span className="text-base font-normal text-secondary">°C</span>
        </p>
        <button
          aria-label="Raise setpoint"
          disabled={disabled || setpoint >= (setpointRule.max ?? 30)}
          onClick={() =>
            apply({ setpoint_c: Math.min(setpoint + (setpointRule.step ?? 0.5), setpointRule.max ?? 30) })
          }
          className="rounded-full border border-subtle p-2 text-secondary transition-colors hover:border-strong hover:text-primary disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-1">
        {fans.map((fan) => (
          <button
            key={fan}
            disabled={disabled}
            onClick={() => apply({ fan })}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              "transition-colors duration-[var(--duration-fast)]",
              (current.fan ?? "auto") === fan
                ? "bg-accent-muted text-accent"
                : "text-tertiary hover:bg-surface-2 hover:text-secondary",
              disabled && "opacity-50",
            )}
          >
            {fan}
          </button>
        ))}
      </div>

      {offline && (
        <p className="text-center text-[11px] text-danger">Device offline</p>
      )}
    </div>
  );
}
