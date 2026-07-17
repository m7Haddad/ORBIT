"use client";

/* Small token-driven primitives shared across the app. */

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-subtle bg-surface-2 px-3 text-sm",
        "text-primary placeholder:text-tertiary",
        "transition-colors focus:border-strong focus:outline-none",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-9 w-full appearance-none rounded-md border border-subtle bg-surface-2",
        "px-3 text-sm text-primary transition-colors focus:border-strong focus:outline-none",
        className,
      )}
      {...props}
    />
  );
});

export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  label,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border border-subtle",
        "transition-colors duration-[var(--duration-base)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "bg-accent" : "bg-surface-2",
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-5 w-5 translate-x-1 rounded-full bg-surface-1 shadow-tile",
          "transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]",
          "data-[state=checked]:translate-x-6 data-[state=checked]:bg-inverse",
        )}
        style={checked ? { background: "var(--text-inverse)" } : undefined}
      />
    </SwitchPrimitive.Root>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-secondary",
    success: "bg-success-muted text-success",
    warning: "bg-warning-muted text-warning",
    danger: "bg-danger-muted text-danger",
    info: "bg-info-muted text-info",
    accent: "bg-accent-muted text-accent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export function DropdownContent({
  children,
  align = "end",
}: {
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          "material-overlay z-50 min-w-44 rounded-md border border-subtle p-1",
          "shadow-overlay",
        )}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  active,
}: {
  children: ReactNode;
  onSelect?: () => void;
  active?: boolean;
}) {
  return (
    <DropdownPrimitive.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm outline-none",
        "text-secondary data-[highlighted]:bg-surface-2 data-[highlighted]:text-primary",
        active && "text-accent data-[highlighted]:text-accent",
      )}
    >
      {children}
    </DropdownPrimitive.Item>
  );
}

export function Spinnerless({ lines = 2 }: { lines?: number }) {
  /* Skeleton block — never a spinner (widget contract). */
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${85 - i * 25}%` }} />
      ))}
    </div>
  );
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const delta = Date.now() - new Date(iso).getTime();
  const seconds = Math.round(delta / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
