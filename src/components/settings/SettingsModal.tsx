"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Plug, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useWsStore } from "@/stores/wsStore";
import { DEMO_MODE } from "@/hooks/useWebSocket";
import { DEMO_USER } from "@/lib/demoData";
import { IconButton, GlassBadge, StatusDot } from "@/components/ui/glass";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "demo";

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const status = useWsStore((s) => s.status);

  const close = () => setSettingsOpen(false);

  const statusTone =
    status === "connected" ? "ok" : status === "reconnecting" ? "warn" : "err";
  const statusText =
    status === "connected" ? "Подключено" : status === "reconnecting" ? "Переподключение…" : "Нет соединения";

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-fern-950/60 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="glass-strong glass-edge relative max-h-[82vh] w-[440px] max-w-full overflow-y-auto rounded-3xl p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-normal text-mint-soft">Настройки</h2>
              <IconButton onClick={close} aria-label="Закрыть">
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            {/* профиль */}
            <section className="glass-light mb-3 rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="glass-medium flex h-10 w-10 items-center justify-center rounded-xl">
                  <Sparkles className="h-4 w-4 text-mint" />
                </div>
                <div>
                  <div className="text-sm text-foreground">{user?.name ?? DEMO_USER.name}</div>
                  <div className="text-[11px] text-[rgba(220,235,230,0.6)]">
                    {user?.role ?? "владелец"}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-[rgba(220,235,230,0.6)]">
                Профиль доступен только для просмотра
              </div>
            </section>

            {/* соединение */}
            <section className="glass-light mb-3 rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-2 text-[13px] text-dim">
                <Plug className="h-4 w-4" /> Соединение
              </div>
              <div className="space-y-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[rgba(220,235,230,0.6)]">WS URL</span>
                  <span className="truncate font-mono text-xs text-dim">{WS_URL}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[rgba(220,235,230,0.6)]">Статус</span>
                  <span className="flex items-center gap-2 text-dim">
                    <StatusDot tone={statusTone} />
                    {statusText}
                  </span>
                </div>
              </div>
              <button
                onClick={() =>
                  toast[DEMO_MODE ? "info" : "success"](
                    DEMO_MODE ? "Демо-режим: переподключение не требуется" : "Переподключаюсь…"
                  )
                }
                className="glass-light mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-[13px] text-dim transition-colors hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Переподключиться
              </button>
            </section>

            {/* интерфейс */}
            <section className="glass-light mb-5 rounded-2xl p-4">
              <div className="mb-3 text-[13px] text-dim">Интерфейс</div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] text-foreground">Тёмная тема</div>
                  <div className="text-[11px] text-[rgba(220,235,230,0.6)]">
                    Светлая тема в разработке
                  </div>
                </div>
                <div
                  className="relative h-6 w-11 shrink-0 cursor-not-allowed rounded-full bg-mint/30 opacity-50"
                  title="Светлая тема в разработке"
                >
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-mint shadow" />
                </div>
              </div>
            </section>

            <button
              onClick={() => {
                close();
                logout();
                window.location.href = "/";
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/12 py-2.5 text-[13px] text-red-300 transition-colors hover:bg-red-500/22"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
