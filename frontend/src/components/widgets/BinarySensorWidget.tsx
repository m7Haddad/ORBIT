"use client";

/* Binary sensor — motion + contact share this component; display labels come
 * from context.capabilityConfig.labels when present ({"true": "Open", …}). */

import { CircleDot } from "lucide-react";
import type { WidgetProps } from "@/config/widgets.config";
import { useCapabilityState } from "@/lib/hooks";
import { Badge, formatRelative } from "@/components/ui/misc";

export default function BinarySensorWidget(props: WidgetProps) {
  const state = useCapabilityState(props.source);

  if (state.loading) {
    return (
      <div className="flex h-full flex-col justify-between">
        <div className="skeleton h-6 w-20 rounded-full" />
        <div className="skeleton h-3.5 w-24" />
      </div>
    );
  }

  const labels = (props.context.capabilityConfig?.labels ?? {}) as Record<
    string,
    string
  >;
  const active = state.value === true;
  const label =
    state.value == null
      ? "No data"
      : (labels[String(active)] ?? (active ? "Active" : "Clear"));

  return (
    <div className="flex h-full flex-col justify-between">
      <Badge tone={active ? "warning" : "success"} className="self-start">
        <CircleDot size={11} />
        {label}
      </Badge>
      <p className="text-[11px] text-tertiary">
        {state.reportedAt
          ? `changed ${formatRelative(state.reportedAt)}`
          : "never reported"}
      </p>
    </div>
  );
}
