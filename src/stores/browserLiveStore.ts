"use client";

import { create } from "zustand";
import { gtwSocket } from "@/lib/gtwSocket";
import type { GtwServerFrame } from "@/types/events";

/**
 * LIVE-просмотр браузера агента. Один общий браузер на хост, поэтому стор
 * глобальный (не по чатам): кадр "browser_frame" несёт base64-JPEG страницы,
 * "browser_live_ack" подтверждает старт/остановку продюсера (или ошибку no_cdp).
 * Старт/стоп — кадр "browser_live" (server.js гейтит по владельцу чата/админу).
 */
interface BrowserLiveState {
  active: boolean; // зритель зарегистрирован, ждём/получаем кадры
  dataUrl: string | null; // последний кадр data:image/jpeg;base64,...
  url: string; // текущий URL страницы браузера
  ts: number; // время последнего кадра (мс)
  fps: number; // скользящая оценка частоты кадров
  error: string | null; // no_cdp | cdp_disconnected
  start: (chatId: string) => void;
  stop: (chatId: string) => void;
}

export const useBrowserLiveStore = create<BrowserLiveState>((set) => ({
  active: false,
  dataUrl: null,
  url: "",
  ts: 0,
  fps: 0,
  error: null,
  start: (chatId) => {
    set({ active: true, error: null, dataUrl: null, url: "", fps: 0 });
    gtwSocket.send({ type: "browser_live", chat_id: chatId || "main", action: "start" });
  },
  stop: (chatId) => {
    set({ active: false, dataUrl: null, fps: 0 });
    gtwSocket.send({ type: "browser_live", chat_id: chatId || "main", action: "stop" });
  },
}));

if (typeof window !== "undefined") {
  let lastFrameAt = 0;
  let fpsAcc = 0;
  let fpsN = 0;
  gtwSocket.onFrame((frame: GtwServerFrame) => {
    if (frame.type === "browser_frame") {
      if (!frame.data) return;
      const now = Date.now();
      if (lastFrameAt) {
        const dt = now - lastFrameAt;
        if (dt > 0 && dt < 5000) {
          fpsAcc += 1000 / dt;
          fpsN += 1;
        }
      }
      lastFrameAt = now;
      const fps = fpsN ? Math.round((fpsAcc / fpsN) * 10) / 10 : 0;
      if (fpsN >= 20) {
        fpsAcc = 0;
        fpsN = 0;
      }
      useBrowserLiveStore.setState((s) => ({
        active: true,
        dataUrl: "data:image/jpeg;base64," + frame.data,
        url: frame.url || s.url,
        ts: frame.ts || now,
        fps,
        error: null,
      }));
    } else if (frame.type === "browser_live_ack") {
      if (frame.active) {
        useBrowserLiveStore.setState({ active: true, error: null });
      } else {
        useBrowserLiveStore.setState({ active: false, fps: 0, error: frame.error || null });
      }
    }
  });
}