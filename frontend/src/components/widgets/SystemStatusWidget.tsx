"use client";

/* System status — real host numbers from GET /system/metrics. */

import type { WidgetProps } from "@/config/widgets.config";
import { useSystemMetrics } from "@/lib/hooks";
import { cn } from "@/lib/cn";

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 100 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function Meter({ label, percent, detail }: { label: string; percent: number; detail?: string }) {
  const tone =
    percent >= 90 ? "bg-danger" : percent >= 70 ? "bg-warning" : "bg-accent";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-secondary">{label}</span>
        <span className="tabular-nums text-tertiary">
          {detail ?? `${percent.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-[width] duration-[var(--duration-base)]", tone)}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function SystemStatusWidget(props: WidgetProps) {
  const metrics = useSystemMetrics();

  if (metrics.isLoading || !metrics.data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-6" />
        ))}
      </div>
    );
  }

  const { cpu, memory, disk, uptime_seconds } = metrics.data;
  const showDisks = props.size !== "2x1";
  const rootDisk = disk.find((d) => d.mount === "/") ?? disk[0];

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="space-y-2.5">
        <Meter
          label={
            cpu.temperature_c != null
              ? `CPU · ${cpu.temperature_c.toFixed(0)}°C`
              : "CPU"
          }
          percent={cpu.usage_percent}
        />
        <Meter
          label="Memory"
          percent={memory.usage_percent}
          detail={`${formatBytes(memory.used_bytes)} / ${formatBytes(memory.total_bytes)}`}
        />
        {showDisks && rootDisk && (
          <Meter
            label={`Disk ${rootDisk.mount}`}
            percent={rootDisk.usage_percent}
            detail={`${formatBytes(rootDisk.used_bytes)} / ${formatBytes(rootDisk.total_bytes)}`}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-[11px] text-tertiary">
        <span>load {cpu.load_avg_1m.toFixed(2)}</span>
        <span>up {formatUptime(uptime_seconds)}</span>
      </div>
    </div>
  );
}
