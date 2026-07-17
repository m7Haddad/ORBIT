"use client";

/* Scene quick-run tile → POST /scenes/{id}/execute. Shows a transient
 * per-action summary from the SceneExecutionResult. */

import { useState } from "react";
import { Play, Sparkles } from "lucide-react";
import type { WidgetProps } from "@/config/widgets.config";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

export default function SceneTileWidget(props: WidgetProps) {
  const sceneId = props.source.kind === "scene" ? props.source.sceneId : null;
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [summary, setSummary] = useState<string | null>(null);

  async function run() {
    if (!sceneId || status === "running") return;
    setStatus("running");
    setSummary(null);
    try {
      const result = await api.executeScene(sceneId);
      const published = result.results.filter((r) => r.status === "published").length;
      const offline = result.results.filter((r) => r.status === "skipped_offline").length;
      setSummary(
        offline > 0 ? `${published} sent · ${offline} offline` : `${published} sent`,
      );
      setStatus("done");
    } catch {
      setSummary("Failed");
      setStatus("failed");
    }
    setTimeout(() => {
      setStatus("idle");
      setSummary(null);
    }, 3000);
  }

  return (
    <button
      onClick={run}
      disabled={props.editing || status === "running"}
      className={cn(
        "flex h-full w-full items-center justify-between gap-3 text-left",
        "transition-opacity",
        status === "running" && "opacity-70",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            "transition-colors duration-[var(--duration-base)]",
            status === "failed"
              ? "bg-danger-muted text-danger"
              : status === "done"
                ? "bg-success-muted text-success"
                : "bg-accent-muted text-accent",
          )}
        >
          <Sparkles size={16} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-primary">Run scene</p>
          <p className="truncate text-[11px] text-tertiary">
            {status === "running" ? "Running…" : (summary ?? "Tap to execute")}
          </p>
        </div>
      </div>
      <Play size={15} className="shrink-0 text-tertiary" />
    </button>
  );
}
