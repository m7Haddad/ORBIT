"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;

export function DialogContent({
  title,
  children,
  className,
  wide,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 data-[state=open]:animate-in"
        style={{ background: "var(--scrim)" }}
      />
      <DialogPrimitive.Content
        className={cn(
          "material-overlay fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)]",
          wide ? "max-w-2xl" : "max-w-md",
          "-translate-x-1/2 -translate-y-1/2 rounded-lg border border-subtle",
          "p-6 shadow-overlay outline-none",
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <DialogPrimitive.Title className="text-base font-semibold text-primary">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close"
            className="rounded-sm p-1 text-tertiary transition-colors hover:bg-surface-2 hover:text-primary"
          >
            <X size={16} />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
