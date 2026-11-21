/**
 * Дашборд: реальные данные.
 *  - пользователи/сессии/события — из SQLite (src/lib/activity.ts, userStore);
 *  - gateway — TCP-проба WS-порта плагина (доступен = процесс слушает);
 *  - аптайм — время работы веб-сервера (Next + WS-прокси).
 */
import { NextRequest, NextResponse } from "next/server";
import net from "node:net";
import { requireAdmin } from "@/lib/adminAuth";
import { listUsers } from "@/lib/userStore";
import {
  activeSessionCount,
  totalSessionCount,
  recentSessions,
  recentEvents,
  failedLoginsSince,
} from "@/lib/activity";

function probeGateway(): Promise<{ reachable: boolean; address: string }> {
  let host = "127.0.0.1";
  let port = 8765;
  try {
    const u = new URL(process.env.GTW_WS_URL || "ws://127.0.0.1:8765/ws");
    host = u.hostname;
    port = Number(u.port || 8765);
  } catch {
    /* дефолты */
  }
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve({ reachable: ok, address: `${host}:${port}` });
    };
    sock.setTimeout(1500);
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.once("timeout", () => done(false));
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const users = listUsers();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const gateway = await probeGateway();

  return NextResponse.json({
    users: {
      total: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      new7d: users.filter((u) => u.source === "db" && u.createdAt >= weekAgo).length,
    },
    sessions: {
      active: activeSessionCount(),
      total: totalSessionCount(),
      recent: recentSessions(10),
    },
    gateway,
    server: {
      uptimeSec: Math.floor(process.uptime()),
      node: process.version,
    },
    security: {
      failedLogins24h: failedLoginsSince(24),
    },
    events: recentEvents(15),
  });
}
