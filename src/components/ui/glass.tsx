"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Круглая стеклянная иконочная кнопка */
export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(function IconButton({ className, active, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "glass-light text-dim transition-all duration-200",
        "hover:text-foreground hover:border-mint/40 hover:shadow-[0_0_16px_rgba(143,184,174,0.2)]",
        "active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        active && "border-mint/50 text-foreground",
        className
      )}
      {...props}
    />
  );
});

/** Маленький стеклянный бейдж */
export function GlassBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "glass-light text-[11px] leading-none text-dim",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Точка статуса с мягким свечением */
export function StatusDot({ tone }: { tone: "ok" | "warn" | "err" }) {
  const color =
    tone === "ok" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : "bg-red-400";
  const glow =
    tone === "ok"
      ? "shadow-[0_0_8px_rgba(117,214,168,0.8)]"
      : tone === "warn"
        ? "shadow-[0_0_8px_rgba(251,191,36,0.8)]"
        : "shadow-[0_0_8px_rgba(248,113,113,0.8)]";
  return <span className={cn("h-2 w-2 rounded-full", color, glow)} />;
}
