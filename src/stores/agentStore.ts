"use client";

import { useDemoStore } from "@/stores/demoStore";
import { useLiveStore } from "@/stores/liveStore";

/**
 * Единая точка доступа компонентов к чату.
 * LIVE (по умолчанию): реальный WS-поток gtw-адаптера через прокси /ws.
 * DEMO: NEXT_PUBLIC_DEMO_MODE=1 — проигрывание демо-ходов (чистый UI-дев без шлюза).
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export const useAgentStore = DEMO_MODE ? useDemoStore : useLiveStore;