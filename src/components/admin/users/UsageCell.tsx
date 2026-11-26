"use client";

/** Ячейка «Токены»: used / limit + полоса расхода (волна 5, D1). */
import type { LimitInfo } from "./types";
import { usageBarClass } from "./format";

export function UsageCell({ info }: { info?: LimitInfo }) {
  if (!info) return <span className="text-[rgba(165,187,179,0.3)] text-xs">—</span>;
  const pct = info.limit ? Math.min(100, Math.round((info.used / info.limit) * 100)) : null;
  return (
    <div className="min-w-[110px]">
      <span className="font-mono text-xs text-[rgba(220,235,230,0.85)]">
        {info.used.toLocaleString("ru-RU")}
        {info.limit ? <span className="text-[rgba(165,187,179,0.5)]"> / {info.limit.toLocaleString("ru-RU")}</span> : null}
      </span>
      {pct !== null && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div className={`h-full rounded-full ${usageBarClass(pct)}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
