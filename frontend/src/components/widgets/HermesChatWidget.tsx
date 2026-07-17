"use client";

/* Hermes chat widget shell. The live chat wiring lands in Stage 6 (build-order
 * item 21) when the Hermes service exists on the Pi; until then this manifest
 * is hidden from the widget picker and this component renders an honest
 * unavailable state (never fake conversation UI). */

import { BotMessageSquare } from "lucide-react";

export default function HermesChatWidget() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <BotMessageSquare size={22} className="text-tertiary" />
      <p className="text-sm font-medium text-primary">Hermes isn&apos;t connected</p>
      <p className="max-w-52 text-[11px] text-tertiary">
        The assistant comes online when the Hermes service is deployed (Stage 6).
      </p>
    </div>
  );
}
