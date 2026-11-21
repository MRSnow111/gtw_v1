/**
 * Одноразовый WS-запрос к gtw-адаптеру для серверных админ-роутов.
 * Токен берётся из env на сервере и никогда не покидает его.
 * Возвращает первый кадр нужного типа или null (шлюз недоступен/таймаут).
 */
import WebSocket from "ws";

export function gtwRequest<T>(frame: object, matchType: string, timeoutMs = 8000): Promise<T | null> {
  const url = process.env.GTW_WS_URL || "ws://127.0.0.1:8765/ws";
  const token = process.env.GTW_TOKEN || "";
  if (!token) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { headers: { "X-GTW-Token": token }, handshakeTimeout: 5000 });
    } catch {
      resolve(null);
      return;
    }
    const done = (v: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    ws.on("open", () => {
      try { ws.send(JSON.stringify(frame)); } catch { done(null); }
    });
    ws.on("message", (data: unknown) => {
      try {
        const f = JSON.parse(String(data));
        if (f && f.type === matchType) done(f as T);
      } catch { /* не JSON — пропускаем */ }
    });
    ws.on("error", () => done(null));
    ws.on("close", () => done(null));
  });
}
