"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu } from "lucide-react";
import { useUiStore, loadArtifactWidth } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { useLiveStore } from "@/stores/liveStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Sidebar } from "@/components/layout/Sidebar";
import { ArtifactPanel } from "@/components/artifacts/ArtifactPanel";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { cn } from "@/lib/utils";

/**
 * Каркас /chat*: три плавающие стеклянные панели над общим фоном.
 * ≥1280px — артефакты видны; <768px — сайдбар в виде drawer.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { drawerOpen, setDrawerOpen, artifactWidth, setArtifactWidth } = useUiStore();
  const [mounted, setMounted] = useState(false);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const user = useAuthStore((s) => s.user);
  useWebSocket(); // держит WS-соединение с прокси /ws (live-режим)

  useEffect(() => setMounted(true), []);

  // сохранённая ширина панели артефактов — применяем после маунта (без SSR-рассинхрона)
  useEffect(() => {
    const saved = loadArtifactWidth();
    if (saved) setArtifactWidth(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // перетаскивание левого края панели: ширина = стартовая + (стартовый X − текущий X)
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: useUiStore.getState().artifactWidth };
    const onMove = (ev: PointerEvent) => {
      const st = resizeRef.current;
      if (st) setArtifactWidth(st.startW + (st.startX - ev.clientX));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  // Список чатов — с сервера per-login: при входе/смене аккаунта грузим свой,
  // при выходе очищаем (изоляция между аккаунтами + синхронизация устройств).
  useEffect(() => {
    if (user) {
      useLiveStore.getState().loadChats?.();
    } else {
      useLiveStore.setState({ chats: [], activeChatId: null, turnsByChat: {} });
    }
  }, [user?.name]);

  // закрытие drawer по Esc
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, setDrawerOpen]);

  return (
    <div className="flex h-dvh w-full gap-3 p-3">
      {/* сайдбар — desktop */}
      <motion.aside
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="hidden w-[290px] shrink-0 md:block"
      >
        <Sidebar className="rounded-[28px] glass-edge" />
      </motion.aside>

      {/* центральная панель */}
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        className="glass-strong glass-edge relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px]"
      >
        {/* гамбургер для мобильных */}
        <button
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "glass-light absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full text-dim md:hidden",
            !mounted && "invisible"
          )}
          aria-label="Открыть меню"
        >
          <Menu className="h-4 w-4" />
        </button>
        {children}
      </motion.main>

      {/* артефакты — только ≥1280px; ширина регулируется перетаскиванием левого края */}
      <motion.aside
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        style={{ width: artifactWidth }}
        className="relative hidden shrink-0 xl:block"
      >
        <div
          onPointerDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину панели артефактов"
          title="Потяните, чтобы изменить ширину панели"
          className="group absolute -left-2 top-0 z-20 flex h-full w-4 cursor-col-resize items-center justify-center"
        >
          <div className="h-16 w-1 rounded-full bg-white/10 transition-colors group-hover:bg-mint/50 group-active:bg-mint" />
        </div>
        <ArtifactPanel className="rounded-[28px] glass-edge" />
      </motion.aside>

      {/* мобильный drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-fern-950/55 backdrop-blur-[2px] md:hidden"
            onClick={() => setDrawerOpen(false)}
          >
            <motion.div
              initial={{ x: -340 }}
              animate={{ x: 0 }}
              exit={{ x: -340 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="absolute bottom-3 left-3 top-3 w-[290px]"
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar className="rounded-[24px] glass-edge" onNavigate={() => setDrawerOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal />
    </div>
  );
}
