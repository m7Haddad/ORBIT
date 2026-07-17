"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { AuthGuard } from "@/components/shell/AuthGuard";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { PaletteProvider } from "@/components/palette/palette-context";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { useRooms } from "@/lib/hooks";

const staticTitles: Record<string, string> = {
  "/": "Dashboard",
  "/devices": "Devices",
  "/scenes": "Scenes",
  "/audit": "Audit Log",
  "/ai-usage": "AI Usage",
  "/settings": "Settings",
};

function TitleResolver({ children }: { children: (title: string) => ReactNode }) {
  const pathname = usePathname();
  const rooms = useRooms();
  const title = useMemo(() => {
    if (staticTitles[pathname]) return staticTitles[pathname];
    if (pathname.startsWith("/rooms/")) {
      const slug = pathname.split("/")[2];
      return rooms.data?.data.find((room) => room.slug === slug)?.name ?? "Room";
    }
    if (pathname.startsWith("/settings")) return "Settings";
    if (pathname.startsWith("/devices")) return "Devices";
    return "ORBIT";
  }, [pathname, rooms.data]);
  return <>{children(title)}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <AuthGuard>
      <PaletteProvider>
        <div className="flex min-h-screen">
          <Sidebar
            mobileOpen={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <TitleResolver>
              {(title) => (
                <Topbar title={title} onMenu={() => setMobileNavOpen(true)} />
              )}
            </TitleResolver>
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
        <CommandPalette />
      </PaletteProvider>
    </AuthGuard>
  );
}
