"use client";

import { useWsStore } from "@/stores/wsStore";
import { Copy, Maximize2, RefreshCw } from "lucide-react";

// Верхняя строка центра: статус-пилюля + круглые иконки-кнопки (референс).
export function ChatHeader({ chatId }: { chatId: string }) {
  const status = useWsStore((s) => s.status);

  const pill =
    status === "connected"
      ? { dot: "bg-[#6EE7A8] shadow-[0_0_8px_rgba(110,231,168,0.9)] animate-pulse", label: "Подключено к агенту" }
      : status === "reconnecting"
        ? { dot: "bg-[rgba(230,200,120,0.9)]", label: "Переподключение…" }
        : { dot: "bg-[rgba(220,80,80,0.85)]", label: "Нет соединения" };

  return (
    <header className="relative flex h-16 shrink-0 items-center justify-between gap-2 px-4 pl-14 pt-1 sm:px-5 sm:pl-5">
      <div className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-[rgba(143,184,174,.07)] px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-xl">
        <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
        <span className="text-[13px] text-2">{pill.label}</span>
        {status === "reconnecting" && (
          <RefreshCw className="h-3 w-3 animate-spin text-[rgba(230,200,120,0.8)]" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-xl text-2 transition-colors hover:bg-white/[0.10] hover:text-1"
          title="Копировать переписку"
        >
          <Copy className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-xl text-2 transition-colors hover:bg-white/[0.10] hover:text-1"
          title="Развернуть"
        >
          <Maximize2 className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
