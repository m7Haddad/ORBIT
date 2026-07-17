"use client";

/* AI usage: OpenRouter cost/token accounting per model/day (Hermes writes the
 * rows; this is the read side). */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AiUsageAggregate, AiUsageEntry } from "@/lib/types";
import { Select, formatRelative } from "@/components/ui/misc";

export default function AiUsagePage() {
  const [groupBy, setGroupBy] = useState<"" | "model" | "day">("model");
  const query = useQuery({
    queryKey: ["ai-usage", groupBy],
    queryFn: () => api.aiUsage({ group_by: groupBy || undefined, limit: 100 }),
  });

  const rows = query.data?.data ?? [];
  const aggregated = groupBy !== "";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-secondary">
          Every Hermes model call, priced. Populated once Hermes comes online.
        </p>
        <Select
          className="w-40"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}
        >
          <option value="model">By model</option>
          <option value="day">By day</option>
          <option value="">Raw calls</option>
        </Select>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="skeleton h-11 rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-subtle py-20 text-center">
          <p className="text-sm font-medium text-primary">No usage recorded</p>
          <p className="mt-1 text-xs text-secondary">
            Hermes reports usage here after Stage 6.
          </p>
        </div>
      ) : (
        <div className="material overflow-hidden rounded-lg border border-subtle shadow-tile">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 border-b border-subtle px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-tertiary">
            <span>{aggregated ? (groupBy === "day" ? "Day" : "Model") : "Call"}</span>
            <span className="text-right">Requests</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">Cost</span>
          </div>
          {rows.map((row, index) =>
            aggregated ? (
              <AggregateRow key={index} row={row as AiUsageAggregate} />
            ) : (
              <EntryRow key={index} row={row as AiUsageEntry} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function AggregateRow({ row }: { row: AiUsageAggregate }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 border-b border-subtle px-4 py-2.5 text-xs last:border-b-0">
      <span className="truncate font-mono text-primary">{row.group}</span>
      <span className="text-right tabular-nums text-secondary">{row.request_count}</span>
      <span className="text-right tabular-nums text-secondary">
        {row.total_tokens.toLocaleString()}
      </span>
      <span className="text-right tabular-nums text-primary">
        ${row.total_cost_usd.toFixed(4)}
      </span>
    </div>
  );
}

function EntryRow({ row }: { row: AiUsageEntry }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 border-b border-subtle px-4 py-2.5 text-xs last:border-b-0">
      <span className="min-w-0">
        <span className="block truncate font-mono text-primary">{row.model}</span>
        <span className="text-[10px] text-tertiary">
          {formatRelative(row.created_at)}
          {row.latency_ms != null && ` · ${row.latency_ms}ms`}
        </span>
      </span>
      <span className="text-right tabular-nums text-secondary">1</span>
      <span className="text-right tabular-nums text-secondary">
        {row.total_tokens.toLocaleString()}
      </span>
      <span className="text-right tabular-nums text-primary">
        ${row.cost_usd.toFixed(4)}
      </span>
    </div>
  );
}
