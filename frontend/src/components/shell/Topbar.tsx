"use client";

import { useRouter } from "next/navigation";
import { Check, LogOut, Menu, Moon, Search, User, Wifi, WifiOff } from "lucide-react";
import { useMe } from "@/lib/hooks";
import { logout } from "@/lib/auth";
import { THEMES, useTheme, type Theme } from "@/lib/theme";
import { useRealtime } from "@/lib/realtime";
import { usePalette } from "@/components/palette/palette-context";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/misc";

const themeLabels: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  midnight: "Midnight",
  glass: "Glass",
};

export function Topbar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const router = useRouter();
  const me = useMe();
  const { theme, setTheme } = useTheme();
  const wsConnected = useRealtime((state) => state.wsConnected);
  const { open: openPalette } = usePalette();

  return (
    <header className="material sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-subtle px-4 md:px-6">
      <button
        aria-label="Open navigation"
        onClick={onMenu}
        className="rounded-md p-1.5 text-secondary hover:bg-surface-2 hover:text-primary md:hidden"
      >
        <Menu size={18} />
      </button>

      <h1 className="flex-1 truncate text-[15px] font-semibold tracking-tight text-primary">
        {title}
      </h1>

      <span
        title={wsConnected ? "Live connection" : "Reconnecting…"}
        className={wsConnected ? "text-success" : "text-warning"}
      >
        {wsConnected ? <Wifi size={15} /> : <WifiOff size={15} />}
      </span>

      <button
        onClick={openPalette}
        className="hidden items-center gap-2 rounded-md border border-subtle bg-surface-2 px-3 py-1.5 text-xs text-tertiary transition-colors hover:border-strong hover:text-secondary sm:flex"
      >
        <Search size={13} />
        <span>Search or command…</span>
        <kbd className="rounded-sm bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
          ⌘K
        </kbd>
      </button>
      <button
        aria-label="Search"
        onClick={openPalette}
        className="rounded-md p-1.5 text-secondary hover:bg-surface-2 hover:text-primary sm:hidden"
      >
        <Search size={16} />
      </button>

      <Dropdown>
        <DropdownTrigger asChild>
          <button
            aria-label="Theme"
            className="rounded-md p-1.5 text-secondary hover:bg-surface-2 hover:text-primary"
          >
            <Moon size={16} />
          </button>
        </DropdownTrigger>
        <DropdownContent>
          {THEMES.map((entry) => (
            <DropdownItem
              key={entry}
              active={entry === theme}
              onSelect={() => setTheme(entry)}
            >
              <span className="flex-1">{themeLabels[entry]}</span>
              {entry === theme && <Check size={14} />}
            </DropdownItem>
          ))}
        </DropdownContent>
      </Dropdown>

      <Dropdown>
        <DropdownTrigger asChild>
          <button
            aria-label="Account"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-accent"
          >
            <User size={15} />
          </button>
        </DropdownTrigger>
        <DropdownContent>
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium text-primary">
              {me.data?.display_name ?? "…"}
            </p>
            <p className="text-xs text-tertiary">{me.data?.email}</p>
          </div>
          <div className="my-1 h-px bg-subtle" />
          <DropdownItem onSelect={() => router.push("/settings")}>
            Settings
          </DropdownItem>
          <DropdownItem
            onSelect={() => {
              void logout().then(() => router.replace("/login"));
            }}
          >
            <LogOut size={14} />
            Sign out
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </header>
  );
}
