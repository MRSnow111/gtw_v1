"use client";

import { create } from "zustand";
import { gtwSocket } from "@/lib/gtwSocket";
import type { GtwServerFrame } from "@/types/events";

/**
 * LIVE-стор индикатора токенов в шапке чата. Агрегат по логину приходит
 * кадром "quota" из WS-прокси (server.js): limit = user_limits.token_limit
 * (null = без лимита), used = SUM(tokens_in+tokens_out) по всем чатам логина.
 * Прокси пушит снимок при подключении и после каждого session_info (учёт токенов).
 * Отдельный стор, чтобы не расширять общий DemoState/demoStore.
 */
interface QuotaState {
  limit: number | null;
  used: number;
  loaded: boolean;
}

export const useQuotaStore = create<QuotaState>(() => ({
  limit: null,
  used: 0,
  loaded: false,
}));

if (typeof window !== "undefined") {
  gtwSocket.onFrame((frame: GtwServerFrame) => {
    if (frame.type === "quota") {
      useQuotaStore.setState({
        limit: typeof frame.limit === "number" && frame.limit > 0 ? frame.limit : null,
        used: typeof frame.used === "number" ? frame.used : 0,
        loaded: true,
      });
    } else if (frame.type === "error" && frame.error === "quota_exceeded") {
      // лимит исчерпан — синхронизируем индикатор с данными ошибки
      useQuotaStore.setState((s) => ({
        limit: typeof frame.limit === "number" ? frame.limit : s.limit,
        used: typeof frame.used === "number" ? frame.used : s.used,
        loaded: true,
      }));
    }
  });
}

/** REST-фолбэк: снимок лимита/расхода при монтировании индикатора. */
export async function refreshQuota(): Promise<void> {
  try {
    const res = await fetch("/api/usage/me", { cache: "no-store" });
    if (!res.ok) return;
    const d = (await res.json()) as { limit?: number | null; used?: number };
    useQuotaStore.setState({
      limit: typeof d.limit === "number" && d.limit > 0 ? d.limit : null,
      used: typeof d.used === "number" ? d.used : 0,
      loaded: true,
    });
  } catch {
    /* офлайн — индикатор обновится WS-пушем */
  }
}