/**
 * Реальные сессии агента: живой опрос gtw-адаптера (кадр sessions),
 * накопление снимков в usage_stats, слияние с лимитами пользователей.
 * Если шлюз недоступен — отдаём последние снимки из БД (live:false).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { gtwRequest } from "@/lib/gtwAdminWs";
import { allUsage, upsertUsage, allLimits, totalTokensForLogin, grandTotalTokens } from "@/lib/usageStore";
import type { SessionInfo } from "@/types/events";

export const dynamic = "force-dynamic";

interface SessionsFrame { type: "sessions"; items: SessionInfo[] }

export interface AdminSessionRow {
  chatId: string;
  login: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  turns: number;
  tools: number;
  toolNames: string[];
  speed: number | null;
  source: string;
  updatedAt: string;
  lastActivity: string;
  limit: number | null;
  usedByLogin: number;
}

function fromDb(): AdminSessionRow[] {
  const limits = allLimits();
  const usedCache = new Map<string, number>();
  return allUsage().map((r) => {
    if (!usedCache.has(r.login)) usedCache.set(r.login, totalTokensForLogin(r.login));
    return {
      chatId: r.chatId, login: r.login, model: r.model, provider: r.provider,
      tokensIn: r.tokensIn, tokensOut: r.tokensOut, totalTokens: r.tokensIn + r.tokensOut,
      turns: r.turns, tools: r.tools, toolNames: [], speed: r.speed, source: r.source,
      updatedAt: r.updatedAt, lastActivity: r.updatedAt,
      limit: limits[r.login] ?? null, usedByLogin: usedCache.get(r.login) ?? 0,
    };
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const live = await gtwRequest<SessionsFrame>({ type: "sessions" }, "sessions", 6000);
  let items: AdminSessionRow[];
  if (live && Array.isArray(live.items)) {
    const limits = allLimits();
    const usedCache = new Map<string, number>();
    items = live.items.map((s) => {
      const login = s.user_id || "";
      upsertUsage({
        chatId: s.chat_id, login, model: s.model || "", provider: s.provider || "",
        tokensIn: s.usage?.inTokens ?? 0, tokensOut: s.usage?.outTokens ?? 0,
        turns: s.turns ?? 0, tools: s.tools?.count ?? 0,
        speed: s.speed?.tokensPerSec ?? null, source: s.source || "unknown",
        updatedAt: new Date().toISOString(),
      });
      if (login && !usedCache.has(login)) usedCache.set(login, totalTokensForLogin(login));
      return {
        chatId: s.chat_id, login, model: s.model || "", provider: s.provider || "",
        tokensIn: s.usage?.inTokens ?? 0, tokensOut: s.usage?.outTokens ?? 0,
        totalTokens: s.usage?.totalTokens ?? 0, turns: s.turns ?? 0,
        tools: s.tools?.count ?? 0, toolNames: s.tools?.names ?? [],
        speed: s.speed?.tokensPerSec ?? null, source: s.source || "unknown",
        updatedAt: new Date().toISOString(), lastActivity: s.lastActivity || "",
        limit: limits[login] ?? null, usedByLogin: usedCache.get(login) ?? 0,
      };
    });
  } else {
    items = fromDb();
  }

  return NextResponse.json({
    live: Boolean(live),
    items,
    totals: { tokens: grandTotalTokens(), chats: items.length },
  });
}
