"use client";

import { Maximize2, Menu, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { MOCK_CHATS } from "@/lib/mockChats";
import { useUiStore } from "@/stores/uiStore";
import { useWsStore, type WsStatus } from "@/stores/wsStore";

const STATUS: Record<WsStatus, { label: string; dot: string }> = {
  connected: { label: "Подключено к агенту", dot: "bg-success" },
  connecting: { label: "Подключение…", dot: "bg-warning animate-pulse" },
  reconnecting: { label: "Переподключение…", dot: "bg-warning animate-pulse" },
  disconnected: { label: "Нет соединения", dot: "bg-destructive" },
};

export function ChatHeader({ chatId }: { chatId: string }) {
  const status = useWsStore((s) => s.status);
  const { artifactsOpen, toggleArtifacts, setSidebarOpen } = useUiStore();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const panelOpen = artifactsOpen ?? isDesktop;
  const title = MOCK_CHATS.find((c) => c.id === chatId)?.title;
  const st = STATUS[status];

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Открыть меню"
          onClick={() => setSidebarOpen(true)}
          className="glass-inner flex h-9 w-9 shrink-0 items-center justify-center rounded-full md:hidden"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        <div className="glass-inner flex items-center gap-2 rounded-full py-1.5 pl-3 pr-3.5 text-[13px]">
          <span className={cn("h-2 w-2 rounded-full", st.dot)} />
          <span className="whitespace-nowrap">{st.label}</span>
        </div>

        {title && (
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
            {title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Развернуть на весь экран"
          onClick={toggleFullscreen}
          className="glass-inner hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground sm:flex"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Артефакты"
          aria-pressed={panelOpen}
          onClick={() => toggleArtifacts(isDesktop)}
          className={cn(
            "glass-inner flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            panelOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
