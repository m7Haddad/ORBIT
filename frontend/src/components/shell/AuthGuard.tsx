"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ensureSession } from "@/lib/auth";
import { startRealtime, stopRealtime } from "@/lib/ws";

/** Gate for the app shell: silent refresh on load, redirect to /login when no
 * session, and lifecycle for the single realtime WebSocket. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureSession().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        router.replace(`/login`);
        return;
      }
      startRealtime();
      setReady(true);
    });
    return () => {
      cancelled = true;
      stopRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    // Full-shell skeleton: sidebar rail + tile grid, zero layout shift.
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-60 shrink-0 border-r border-subtle p-4 md:block">
          <div className="skeleton mb-8 h-8 w-28" />
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-8" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="skeleton mb-6 h-9 w-64" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton aspect-square rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
