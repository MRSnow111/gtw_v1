"use client";

import { useEffect } from "react";
import { useQuotaStore, refreshQuota } from "@/stores/quotaStore";

/**
 * Индикатор лимита/расхода токенов в шапке чата (live-режим).
 * Агрегат по логину из кадра "quota": потрачено / лимит + прогресс-бар.
 * Без лимита — только расход и знак ∞. Цвет по заполнению: ≥80% amber, ≥100% red.
 */
const fmtFull = (n: number) => n.toLocaleString("ru-RU");
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("ru-RU")} тыс.`;
  return n.toLocaleString("ru-RU");
}

export function TokenIndicator() {
  const { limit, used, loaded } = useQuotaStore();
  useEffect(() => {
    if (!useQuotaStore.getState().loaded) void refreshQuota();
  }, []);
  if (!loaded) return null;

  const hasLimit = limit !== null && limit > 0;
  const pct = hasLimit ? Math.min(1, used / (limit as number)) : 0;
  const tone = !hasLimit ? "ok" : pct >= 1 ? "err" : pct >= 0.8 ? "warn" : "ok";
  const fill = tone === "err" ? "bg-red-400" : tone === "warn" ? "bg-amber-400" : "bg-emerald-400";
  const remaining = hasLimit ? Math.max(0, (limit as number) - used) : null;
  const title = hasLimit
    ? `Токены: потрачено ${fmtFull(used)} из ${fmtFull(limit as number)}. Осталось ${fmtFull(remaining as number)}.`
    : `Токены: потрачено ${fmtFull(used)}. Лимит не установлен.`;

  return (
    <div
      className="glass-light flex items-center gap-2 rounded-full px-3 py-1.5"
      title={title}
      aria-label={title}
    >
      {hasLimit && (
        <div className="h-1 w-14 overflow-hidden rounded-full bg-white/[0.1]">
          <div className={`h-full rounded-full transition-all ${fill}`} style={{ width: `${pct * 100}%` }} />
        </div>
      )}
      <span className="whitespace-nowrap text-[11.5px] tabular-nums text-dim">
        {hasLimit ? `${fmtCompact(used)} / ${fmtCompact(limit as number)}` : fmtCompact(used)}
      </span>
      {!hasLimit && <span className="text-[11px] leading-none text-[rgba(165,187,179,0.45)]">∞</span>}
    </div>
  );
}