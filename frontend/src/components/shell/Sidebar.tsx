"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Cpu,
  LayoutGrid,
  Orbit,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useRooms } from "@/lib/hooks";
import { iconFor } from "@/components/shell/icons";
import { cn } from "@/lib/cn";

const pages = [
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/scenes", label: "Scenes", icon: Sparkles },
  { href: "/audit", label: "Audit Log", icon: Activity },
  { href: "/ai-usage", label: "AI Usage", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const rooms = useRooms();

  const nav = (
    <nav className="flex h-full flex-col p-4">
      <Link
        href="/"
        onClick={onClose}
        className="mb-8 flex items-center gap-2.5 px-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-muted text-accent">
          <Orbit size={18} strokeWidth={1.75} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-primary">
          ORBIT
        </span>
      </Link>

      <NavLink
        href="/"
        active={pathname === "/"}
        icon={LayoutGrid}
        label="Dashboard"
        onClick={onClose}
      />

      <p className="mb-1 mt-6 px-2.5 text-[11px] font-medium uppercase tracking-wider text-tertiary">
        Rooms
      </p>
      <div className="space-y-0.5">
        {rooms.isLoading &&
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton mx-1 h-8" />
          ))}
        {rooms.data?.data.map((room) => {
          const Icon = iconFor(room.icon);
          const href = `/rooms/${room.slug}`;
          return (
            <NavLink
              key={room.id}
              href={href}
              active={pathname === href}
              icon={Icon}
              label={room.name}
              badge={room.device_count || undefined}
              onClick={onClose}
            />
          );
        })}
      </div>

      <p className="mb-1 mt-6 px-2.5 text-[11px] font-medium uppercase tracking-wider text-tertiary">
        Manage
      </p>
      <div className="space-y-0.5">
        {pages.map((page) => (
          <NavLink
            key={page.href}
            href={page.href}
            active={pathname.startsWith(page.href)}
            icon={page.icon}
            label={page.label}
            onClick={onClose}
          />
        ))}
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="material sticky top-0 hidden h-screen w-60 shrink-0 border-r border-subtle md:block">
        {nav}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0"
            style={{ background: "var(--scrim)" }}
            onClick={onClose}
          />
          <aside className="material-overlay absolute inset-y-0 left-0 w-64 border-r border-subtle shadow-overlay">
            <button
              aria-label="Close"
              onClick={onClose}
              className="absolute right-3 top-4 rounded-sm p-1 text-tertiary hover:text-primary"
            >
              <X size={16} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
        "transition-colors duration-[var(--duration-fast)]",
        active
          ? "bg-accent-muted font-medium text-accent"
          : "text-secondary hover:bg-surface-2 hover:text-primary",
      )}
    >
      <Icon size={16} strokeWidth={1.75} />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular-nums text-tertiary">
          {badge}
        </span>
      )}
    </Link>
  );
}
