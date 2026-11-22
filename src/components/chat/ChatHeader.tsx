"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Copy, Info, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { useWsStore } from "@/stores/wsStore";
import { useUiStore } from "@/stores/uiStore";
import { useAgentStore, DEMO_MODE } from "@/stores/agentStore";
import { IconButton, StatusDot } from "@/components/ui/glass";
import { SessionInfoPanel } from "@/components/chat/SessionInfoPanel";
import { ModelPicker } from "@/components/chat/ModelPicker";

export function ChatHeader({ title }: { title?: string }) {
  const status = useWsStore((s) => s.status);
  const { focusComposer } = useUiStore();
  const activeChatId = useAgentStore((s) => s.activeChatId);
  const [showInfo, setShowInfo] = useState(false);

  const tone = status === "connected" ? "ok" : status === "reconnecting" ? "warn" : "err";
  const text =
    status === "connected"
      ? "Подключено к агенту"
      : status === "reconnecting"
        ? "Переподключение…"
        : "Нет соединения";

  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-4">
      {/* отступ под мобильный гамбургер */}
      <div className="w-9 md:hidden" />
      <div className="min-w-0 flex-1">
        {title && (
          <div className="truncate text-[14px] text-foreground">{title}</div>
        )}
      </div>
      <div className="glass-light flex items-center gap-2 rounded-full px-3 py-1.5">
        <StatusDot tone={tone} />
        <span className="text-[11.5px] text-dim">{text}</span>
      </div>
      {!DEMO_MODE && activeChatId && <ModelPicker chatId={activeChatId} />}
      <IconButton
        aria-label="Информация о сессии"
        title="Информация о сессии"
        onClick={() => setShowInfo((v) => !v)}
      >
        <Info className="h-4 w-4" />
      </IconButton>
      <IconButton
        aria-label="Копировать переписку"
        title="Копировать переписку"
        onClick={() => toast.success("Переписка скопирована")}
      >
        <Copy className="h-4 w-4" />
      </IconButton>
      <IconButton
        aria-label="Развернуть"
        title="Развернуть"
        onClick={focusComposer}
      >
        <Maximize2 className="h-4 w-4" />
      </IconButton>
      <AnimatePresence>
        {showInfo && activeChatId && (
          <SessionInfoPanel chatId={activeChatId} onClose={() => setShowInfo(false)} />
        )}
      </AnimatePresence>
    </header>
  );
}
