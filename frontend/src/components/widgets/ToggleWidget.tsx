"use client";

/* Toggle widget — the optimistic-UI reference implementation (CLAUDE.md):
 * flip instantly, reconcile on the WebSocket-confirmed state, roll back with
 * a danger affordance on 409/4xx or confirmation timeout. */

import { useEffect } from "react";
import { Power } from "lucide-react";
import type { WidgetProps } from "@/config/widgets.config";
import { useCapabilityState, useCapabilityWrite } from "@/lib/hooks";
import { Toggle } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

export default function ToggleWidget(props: WidgetProps) {
  const state = useCapabilityState(props.source);
  const writer = useCapabilityWrite(props.source);

  // Failure flash auto-dismisses.
  useEffect(() => {
    if (state.failed) {
      const timer = setTimeout(writer.dismissFailure, 2400);
      return () => clearTimeout(timer);
    }
  }, [state.failed, writer.dismissFailure]);

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-between">
        <div className="skeleton h-10 w-10 rounded-full" />
        <div className="skeleton h-7 w-12 rounded-full" />
      </div>
    );
  }

  const on = state.value === true;
  const offline = state.online === false;

  return (
    <div
      className={cn(
        "flex h-full items-center justify-between gap-3",
        state.failed && "animate-[orbit-shake_320ms_ease-in-out]",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            "transition-colors duration-[var(--duration-base)]",
            on ? "bg-accent text-inverse" : "bg-surface-2 text-tertiary",
            state.pending && "animate-pulse",
            state.failed && "bg-danger-muted text-danger",
          )}
        >
          <Power size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">
            {state.failed ? "Failed" : on ? "On" : "Off"}
          </p>
          <p className="truncate text-[11px] text-tertiary">
            {offline
              ? "Device offline"
              : state.pending
                ? "Confirming…"
                : " "}
          </p>
        </div>
      </div>
      <Toggle
        checked={on}
        disabled={offline || props.editing}
        onCheckedChange={(next) => writer.write(next)}
        label={props.context.title}
      />
    </div>
  );
}
