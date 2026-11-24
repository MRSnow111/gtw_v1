/**
 * Лимиты токенов пользователей (только админ).
 * token_limit: null или 0 = без лимита; enforcement — в WS-прокси server.js.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSession } from "@/lib/adminAuth";
import { allLimits, setLimit, totalTokensForLogin, getResetConfig } from "@/lib/usageStore";
import { listUsers } from "@/lib/userStore";
import { logEvent } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const limits = allLimits();
  const users = listUsers().map((u) => {
    const rc = getResetConfig(u.login);
    return {
      login: u.login,
      role: u.role,
      limit: limits[u.login] ?? null,
      used: totalTokensForLogin(u.login),
      resetMode: rc.mode,
      resetHour: rc.hour,
      resetDay: rc.day,
      nextResetAt: rc.nextResetAt,
      lastResetAt: rc.lastResetAt,
    };
  });
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body: { login?: string; tokenLimit?: number | null };
  try { body = await request.json(); } catch { return NextResponse.json({ code: "bad_request" }, { status: 400 }); }
  const login = String(body.login || "");
  const known = listUsers().some((u) => u.login === login);
  if (!known) {
    return NextResponse.json({ code: "not_found", message: "Пользователь не найден" }, { status: 404 });
  }
  let limit: number | null = null;
  if (body.tokenLimit !== null && body.tokenLimit !== undefined) {
    const n = Number(body.tokenLimit);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
      return NextResponse.json({ code: "bad_request", message: "Лимит: целое число токенов (0 = без лимита)" }, { status: 400 });
    }
    limit = Math.round(n);
  }
  setLimit(login, limit);
  const session = await getSession(request);
  logEvent("limit_set", session?.login || "admin", `${login}: ${limit ? limit.toLocaleString("ru-RU") + " токенов" : "без лимита"}`);
  return NextResponse.json({ ok: true, login, tokenLimit: limit });
}
