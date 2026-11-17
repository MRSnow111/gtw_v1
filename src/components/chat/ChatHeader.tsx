"use client";

import { useWsStore } from "@/stores/wsStore";
import { MoreHorizontal, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatHeader({ chatId }: { chatId: string }) {
  const status = useWsStore((s) => s.status);

  // TODO: имя чата и модель — с сервера (docs/design.md §9, чат-метаданные).
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[rgba(220,235,230,0.08)] px-4">
      <div className="flex items-center gap-2">
        <span className="font-medium text-[rgba(220,235,230,0.85)]">
          Анализ отчёта
        </span>
        <span className="text-xs text-[rgba(220,235,230,0.3)]">|</span>
        <span className="text-xs text-[rgba(143,184,174,0.7)]">
          hermes-fast
        </span>
      </div>

      {/* Индикатор соединения: только показывает, не переключается кликом.
          При disconnect/plane — баннер над композером (docs/design.md §4). */}
      <div className="flex items-center gap-1">
        <span className="mr-1 text-[11px] text-[rgba(220,235,230,0.35)]">
          {status === "connected"
            ? "онлайн"
            : status === "reconnecting"
              ? "переподключение…"
              : "нет соединения"}
        </span>
        {status === "connected" ? (
          <Wifi className="h-4 w-4 text-[#75D6A8]" />
        ) : status === "reconnecting" ? (
          <RefreshCw className="h-4 w-4 animate-spin text-[rgba(230,200,120,0.8)]" />
        ) : (
          <WifiOff className="h-4 w-4 text-[rgba(220,80,80,0.7)]" />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-[rgba(220,235,230,0.5)] hover:bg-[rgba(143,184,174,0.08)] hover:text-[rgba(220,235,230,0.9)]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
