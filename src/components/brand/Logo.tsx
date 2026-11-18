import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Знак GTW — «врата»: арка шлюза, через которую проходит луч.
 * Чистый SVG, цвета берёт из токенов темы.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--primary) / 0.45)" />
        </linearGradient>
      </defs>
      {/* арка */}
      <path
        d="M7 27V15a9 9 0 0 1 18 0v12"
        stroke={`url(#${id})`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* луч, проходящий через врата */}
      <path d="M3 21h26" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />
      <circle cx="16" cy="21" r="3.2" fill={`url(#${id})`} />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && <span className="text-lg font-semibold tracking-wide">GTW</span>}
    </div>
  );
}
