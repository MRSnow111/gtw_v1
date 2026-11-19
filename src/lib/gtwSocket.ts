"use client";

import type { GtwClientFrame, GtwServerFrame } from "@/types/events";
import type { WsStatus } from "@/stores/wsStore";

type FrameListener = (frame: GtwServerFrame) => void;
type StatusListener = (status: WsStatus) => void;

/**
 * Синглтон нативного WebSocket к /ws (same-origin). Реконнект с backoff+jitter,
 * очередь кадров до открытия соединения. Токен не участвует — его подставляет
 * серверный прокси (server.js), браузер авторизован кукой gtw-auth.
 */
class GtwSocket {
  private ws: WebSocket | null = null;
  private frameListeners = new Set<FrameListener>();
  private statusListeners = new Set<StatusListener>();
  private queue: string[] = [];
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  status: WsStatus = "disconnected";

  start() {
    if (typeof window === "undefined") return;
    this.stopped = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  send(frame: GtwClientFrame) {
    const data = JSON.stringify(frame);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.queue.push(data);
      if (this.queue.length > 100) this.queue.shift();
      this.start();
    }
  }

  onFrame(cb: FrameListener): () => void {
    this.frameListeners.add(cb);
    return () => {
      this.frameListeners.delete(cb);
    };
  }

  onStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private setStatus(s: WsStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  private connect() {
    this.setStatus(this.attempts > 0 ? "reconnecting" : "connecting");
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus("connected");
      const pending = this.queue.splice(0);
      for (const data of pending) {
        try {
          ws.send(data);
        } catch {}
      }
    };
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(String(ev.data)) as GtwServerFrame;
        this.frameListeners.forEach((cb) => cb(frame));
      } catch (e) {
        console.warn("[gtw] не разобрал кадр WS:", e);
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) this.scheduleReconnect();
      else this.setStatus("disconnected");
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }

  private scheduleReconnect() {
    this.setStatus("reconnecting");
    const delay = Math.min(30000, 1000 * 2 ** this.attempts) + Math.random() * 500;
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

export const gtwSocket = new GtwSocket();