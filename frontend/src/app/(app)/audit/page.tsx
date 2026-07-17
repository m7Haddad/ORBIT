"use client";

/* Audit log: the attribution ledger — user, Hermes, and n8n as first-class
 * actor chips, filterable, newest first. */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, User, Workflow } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Select, formatRelative } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

const actorMeta = {
  user: { icon: User, tone: "accent" as const, label: "User" },
  hermes: { icon: Bot, tone: "info" as const, label: "Hermes" },
  n8n: { icon: Workflow, tone: "warning" as const, label: "n8n" },
};

const PAGE_SIZE = 30;

export default function AuditPage() {
  const [actorType, setActorType] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["audit", actorType, action, page],
    queryFn: () =>
      api.auditLog({
        actor_type: actorType || undefined,
        action: action || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const total = query.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={actorType}
          onChange={(event) => {
            setActorType(event.target.value);
            setPage(0);
          }}
        >
          <option value="">All actors</option>
          <option value="user">User</option>
          <option value="hermes">Hermes</option>
          <option value="n8n">n8n</option>
        </Select>
        <Select
          className="w-56"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(0);
          }}
        >
          <option value="">All actions</option>
          <option value="device.capability.write">Capability writes</option>
          <option value="scene.executed">Scene executions</option>
          <option value="device.registered">Device registrations</option>
          <option value="device.deleted">Device deletions</option>
          <option value="auth.login">Logins</option>
          <option value="auth.login.failed">Failed logins</option>
        </Select>
        <span className="ml-auto text-xs tabular-nums text-tertiary">
          {total} entries
        </span>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="skeleton h-12 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="material overflow-hidden rounded-lg border border-subtle shadow-tile">
          {query.data?.data.length === 0 && (
            <p className="p-10 text-center text-xs text-tertiary">
              Nothing matches these filters.
            </p>
          )}
          {query.data?.data.map((entry) => {
            const meta = actorMeta[entry.actor_type];
            const Icon = meta.icon;
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 border-b border-subtle px-4 py-3 last:border-b-0"
              >
                <Badge tone={meta.tone} className="w-20 justify-center">
                  <Icon size={11} />
                  {meta.label}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-primary">
                    {entry.action}
                  </p>
                  <p className="truncate text-[11px] text-tertiary">
                    {entry.target_type}
                    {entry.target_id ? ` · ${entry.target_id.slice(0, 8)}…` : ""}
                    {describeContext(entry.actor_context)}
                  </p>
                </div>
                <span
                  className="shrink-0 text-[11px] tabular-nums text-tertiary"
                  title={new Date(entry.created_at).toLocaleString()}
                >
                  {formatRelative(entry.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-xs tabular-nums text-tertiary">
            {page + 1} / {pages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function describeContext(context: Record<string, unknown>): string {
  if (context.workflow_id) return ` · workflow ${String(context.workflow_id)}`;
  if (context.conversation_id)
    return ` · conversation ${String(context.conversation_id).slice(0, 8)}`;
  return "";
}
