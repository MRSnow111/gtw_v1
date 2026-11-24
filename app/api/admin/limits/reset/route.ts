/**
 * Ручной сброс расхода токенов пользователя (только админ).
 * Обнуляет used через usage_offset (см. usageStore.resetUsage); сам лимит
 * token_limit и конфиг авто-сброса не меняются. Enforcement — в server.js.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSession } from "@/lib/adminAuth";
import { resetUsage } from "@/lib/usageStore";
import { listUsers } from "@/lib/userStore";
import { logEvent } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body: { login?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ code: "bad_request" }, { status: 400 }); }
  const login = String(body.login || "");
  const known = listUsers().some((u) => u.login === login);
  if (!known) {
    return NextResponse.json({ code: "not_found", message: "Пользователь не найден" }, { status: 404 });
  }
  const { used, offset } = resetUsage(login);
  const session = await getSession(request);
  logEvent("usage_reset", session?.login || "admin", `${login}: расход обнулён (offset ${offset.toLocaleString("ru-RU")})`);
  return NextResponse.json({ ok: true, login, used });
}