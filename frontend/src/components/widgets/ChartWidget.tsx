"use client";

/* History chart — alternative view for any numeric capability. Ranges map to
 * sensible interval/aggregate pairs for GET .../readings. */

import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WidgetProps } from "@/config/widgets.config";
import { useCapabilityHistory } from "@/lib/hooks";
import { cn } from "@/lib/cn";

const RANGES = [
  { key: "1h", label: "1h", ms: 3_600_000, interval: "1m" },
  { key: "24h", label: "24h", ms: 86_400_000, interval: "15m" },
  { key: "7d", label: "7d", ms: 604_800_000, interval: "2h" },
] as const;

export default function ChartWidget(props: WidgetProps) {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("24h");
  // `from` is captured when the range changes, not on every render — keeps the
  // query key stable and satisfies render purity.
  const [fromByRange, setFromByRange] = useState<Record<string, string>>(() => ({
    "24h": new Date(Date.now() - 86_400_000).toISOString(),
  }));
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const from =
    fromByRange[rangeKey] ?? new Date(0).toISOString();

  function selectRange(key: (typeof RANGES)[number]["key"]) {
    const entry = RANGES.find((r) => r.key === key)!;
    setFromByRange((current) => ({
      ...current,
      [key]: new Date(Date.now() - entry.ms).toISOString(),
    }));
    setRangeKey(key);
  }
  const history = useCapabilityHistory(props.source, {
    from,
    interval: range.interval,
    aggregate: "avg",
  });

  const data = (history.data?.data ?? [])
    .filter((reading) => typeof reading.value === "number")
    .map((reading) => ({
      time: new Date(reading.recorded_at).getTime(),
      value: reading.value as number,
    }));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex gap-1 self-end rounded-md bg-surface-2 p-0.5">
        {RANGES.map((entry) => (
          <button
            key={entry.key}
            onClick={() => selectRange(entry.key)}
            className={cn(
              "rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors",
              entry.key === rangeKey
                ? "bg-surface-1 text-primary shadow-tile"
                : "text-tertiary hover:text-secondary",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {history.isLoading ? (
        <div className="skeleton flex-1" />
      ) : data.length < 2 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-tertiary">
          Not enough data for this range
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id={`fill-${props.instanceId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(time: number) =>
                  range.key === "7d"
                    ? new Date(time).toLocaleDateString(undefined, { weekday: "short" })
                    : new Date(time).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                }
                tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={46}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                }}
                labelFormatter={(time) => new Date(Number(time)).toLocaleString()}
                formatter={(value) => [
                  `${Number(value).toFixed(1)}${props.context.unit ?? ""}`,
                  props.context.title,
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent-primary)"
                strokeWidth={1.75}
                fill={`url(#fill-${props.instanceId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
