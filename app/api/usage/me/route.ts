import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminAuth";
import { getLimit, totalTokensForLogin } from "@/lib/usageStore";

/**
 * GET /api/usage/me — лимит и расход токенов текущего пользователя.
 * Фолбэк для индикатора в шапке чата на случай, если стартовый WS-кадр
 * "quota" ещё не доставлен; дальше индикатор живёт на WS-пушах прокси.
 * Авторизация — подписанная кука gtw-auth (как у остальных API).
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const login = session.login;
  return NextResponse.json({ login, limit: getLimit(login), used: totalTokensForLogin(login) });
}