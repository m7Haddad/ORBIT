"use client";

/* Sensor widget — one component for every read-only numeric capability
 * (temperature, humidity, energy_power, …). Value + unit + sparkline; larger
 * sizes add range context. */

import { useState } from "react";
import type { WidgetProps } from "@/config/widgets.config";
import { useCapabilityHistory, useCapabilityState } from "@/lib/hooks";
import { formatRelative } from "@/components/ui/misc";

export default function SensorWidget(props: WidgetProps) {
  const state = useCapabilityState(props.source);
  // Captured once at mount (lazy initializer) so the query key stays stable.
  const [from] = useState(
    () => new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  );
  const history = useCapabilityHistory(props.source, {
    from,
    interval: "2m",
    aggregate: "avg",
  });

  if (state.loading) {
    return (
      <div className="flex h-full flex-col justify-between">
        <div className="skeleton h-9 w-24" />
        <div className="skeleton h-8" />
      </div>
    );
  }

  const value = typeof state.value === "number" ? state.value : null;
  const points = (history.data?.data ?? [])
    .map((reading) => reading.value)
    .filter((v): v is number => typeof v === "number");
  const min = points.length ? Math.min(...points) : null;
  const max = points.length ? Math.max(...points) : null;
  const big = props.size === "2x2" || props.size === "4x2";

  return (
    <div className="flex h-full flex-col">
      <p className="tabular-nums text-3xl font-semibold tracking-tight text-primary">
        {value !== null ? formatNumber(value) : "—"}
        {props.context.unit && (
          <span className="ml-1 text-base font-normal text-secondary">
            {props.context.unit}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[11px] text-tertiary">
        {formatRelative(state.reportedAt)}
      </p>

      <div className="mt-auto">
        {points.length > 1 && (
          <Sparkline values={points} height={big ? 56 : 28} />
        )}
        {big && min !== null && max !== null && (
          <div className="mt-2 flex justify-between text-[11px] tabular-nums text-tertiary">
            <span>low {formatNumber(min)}</span>
            <span>high {formatNumber(max)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatNumber(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function Sparkline({
  values,
  height,
}: {
  values: number[];
  height: number;
}) {
  const width = 200;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - 3 - ((value - min) / span) * (height - 6)).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      aria-hidden
    >
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill="var(--accent-muted)"
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
