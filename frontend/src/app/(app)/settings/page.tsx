"use client";

/* Settings: Appearance (the four themes), Account, Sessions (remote logout),
 * and the deliberate device-registration entry point. */

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Cpu, Laptop, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { THEMES, useTheme, type Theme } from "@/lib/theme";
import { Badge, formatRelative } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const themeDescriptions: Record<Theme, string> = {
  light: "Warm neutrals, dark text",
  dark: "Soft dark gray, elevated surfaces",
  midnight: "Near-black, OLED-friendly",
  glass: "Dark + translucency and blur",
};

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const me = useMe();
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: api.sessions });

  async function revoke(sessionId: string) {
    await api.revokeSession(sessionId);
    void queryClient.invalidateQueries({ queryKey: ["sessions"] });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <h2 className="mb-1 text-sm font-semibold text-primary">Appearance</h2>
        <p className="mb-3 text-xs text-secondary">
          Four themes, one token system — switch any time, everything follows.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEMES.map((entry) => (
            <button
              key={entry}
              onClick={() => setTheme(entry)}
              className={cn(
                "material rounded-md border p-3 text-left transition-colors",
                entry === theme
                  ? "border-strong ring-1 ring-[var(--accent-primary)]"
                  : "border-subtle hover:border-strong",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium capitalize text-primary">
                  {entry}
                </span>
                {entry === theme && <Check size={13} className="text-accent" />}
              </div>
              <p className="text-[10px] leading-tight text-tertiary">
                {themeDescriptions[entry]}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-primary">Account</h2>
        <div className="material rounded-lg border border-subtle p-4 shadow-tile">
          <p className="text-sm font-medium text-primary">
            {me.data?.display_name}
          </p>
          <p className="text-xs text-tertiary">{me.data?.email}</p>
          <Badge tone="accent" className="mt-2 capitalize">
            {me.data?.role}
          </Badge>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-primary">Sessions</h2>
        <p className="mb-3 text-xs text-secondary">
          Active sign-ins on this account. Revoking one logs that device out.
        </p>
        <div className="material overflow-hidden rounded-lg border border-subtle shadow-tile">
          {sessions.isLoading && <div className="skeleton m-4 h-10" />}
          {sessions.data?.data.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-3 border-b border-subtle px-4 py-3 last:border-b-0"
            >
              <Laptop size={15} className="shrink-0 text-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-primary">
                  {session.user_agent ?? "Unknown client"}
                </p>
                <p className="text-[11px] text-tertiary">
                  {session.ip_address ?? "unknown ip"} · started{" "}
                  {formatRelative(session.created_at)}
                </p>
              </div>
              {session.current ? (
                <Badge tone="success">this device</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void revoke(session.id)}
                >
                  <LogOut size={13} /> Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-primary">
          Devices &amp; registration
        </h2>
        <Link
          href="/devices"
          className="material flex items-center gap-3 rounded-lg border border-subtle p-4 shadow-tile transition-colors hover:border-strong"
        >
          <Cpu size={16} className="text-accent" />
          <div>
            <p className="text-sm font-medium text-primary">Manage devices</p>
            <p className="text-[11px] text-tertiary">
              Registration is manual and deliberate — no auto-discovery, by
              design.
            </p>
          </div>
        </Link>
      </section>
    </div>
  );
}
