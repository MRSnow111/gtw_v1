"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Activity, Cpu, Gauge, RefreshCw, Wrench, X, Zap } from "lucide-react";
import { useAgentStore } from "@/stores/agentStore";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ru-RU");

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

function Stat({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
}) {
  return (
    <div className="glass-light rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-[rgba(165,187,179,0.55)]">
        {icon} {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-medium text-foreground" title={value}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10.5px] text-[rgba(165,187,179,0.55)]">{sub}</div>}
    </div>
  );
}

/** Окно информации о сессии: модель, токены, скорость, инструменты. */
export function SessionInfoPanel({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const info = useAgentStore((s) => s.sessionInfoByChat?.[chatId]);
  const requestSessionInfo = useAgentStore((s) => s.requestSessionInfo);

  useEffect(() => {
    if (!requestSessionInfo) return;
    requestSessionInfo(chatId);
    const t = setInterval(() => requestSessionInfo(chatId), 10000);
    return () => clearInterval(t);
  }, [chatId, requestSessionInfo]);

  const sourceLabel =
    info?.source === "agent" ? "счётчики агента"
    : info?.source === "estimate" ? "оценка по стриму"
    : "нет данных";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong absolute right-4 top-[60px] z-30 w-[320px] rounded-2xl border border-white/[0.09] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
      style={{ background: "linear-gradient(135deg, rgba(23,46,42,0.985), rgba(13,28,25,0.99))" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Activity className="h-4 w-4 text-mint" /> Сессия
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Обновить"
            title="Обновить"
            onClick={() => requestSessionInfo?.(chatId)}
            className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label="Закрыть"
            onClick={onClose}
            className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!requestSessionInfo ? (
        <p className="text-[12px] leading-relaxed text-dim">
          Статистика доступна в live-режиме при подключении к агенту.
        </p>
      ) : !info ? (
        <p className="text-[12px] leading-relaxed text-dim">
          Запрашиваем данные сессии… Отправьте сообщение агенту, если статистика ещё не появилась.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Stat
            icon={<Cpu className="h-3 w-3" />}
            label="Модель"
            value={info.model || "неизвестно"}
            sub={info.provider ? `провайдер: ${info.provider}` : undefined}
          />
          <div className="grid grid-cols-2 gap-2">
            <Stat
              icon={<Zap className="h-3 w-3" />}
              label="Токены"
              value={fmt(info.usage.totalTokens)}
              sub={`↑ ${fmt(info.usage.inTokens)} · ↓ ${fmt(info.usage.outTokens)}`}
            />
            <Stat
              icon={<Gauge className="h-3 w-3" />}
              label="Скорость"
              value={info.speed.tokensPerSec !== null ? `${info.speed.tokensPerSec} ток/с` : "—"}
              sub={info.speed.lastTurnMs !== null ? `ход ${(info.speed.lastTurnMs / 1000).toFixed(1)}с` : undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              icon={<Wrench className="h-3 w-3" />}
              label="Инструменты"
              value={fmt(info.tools.count)}
              sub={info.tools.names.length ? info.tools.names.slice(-3).join(", ") : "не вызывались"}
            />
            <Stat
              icon={<Activity className="h-3 w-3" />}
              label="Ходы"
              value={fmt(info.turns)}
              sub={info.usage.apiCalls ? `${fmt(info.usage.apiCalls)} API-${plural(info.usage.apiCalls, "вызов", "вызова", "вызовов")}` : undefined}
            />
          </div>
          {info.usage.costUsd !== undefined && info.usage.costUsd > 0 && (
            <div className="text-[11px] text-dim">
              Оценка стоимости: <span className="text-foreground">${info.usage.costUsd.toFixed(4)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[10.5px] text-[rgba(165,187,179,0.5)]">
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                info.source === "agent" ? "bg-mint/[0.12] text-mint" : "bg-white/[0.05]"
              )}
            >
              {sourceLabel}
            </span>
            {info.lastActivity && (
              <span>
                активность: {new Date(info.lastActivity).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
