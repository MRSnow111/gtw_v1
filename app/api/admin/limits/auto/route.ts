/**
 * Конфиг авто-сброса расхода токенов (только админ).
 * mode: off | daily | weekly | monthly; hour 0-23 (UTC); day: weekly 1-7 (Пн-Вс),
 * monthly 1-28. Планировщик в server.js обнуляет used по next_reset_at.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSession } from "@/lib/adminAuth";
import { setResetConfig, type ResetMode } from "@/lib/usageStore";
import { listUsers } from "@/lib/userStore";
import { logEvent } from "@/lib/activity";

export const dynamic = "force-dynamic";

const MODES: ResetMode[] = ["off", "daily", "weekly", "monthly"];
const MODE_LABEL: Record<ResetMode, string> = {
  off: "выключен",
  daily: "ежедневно",
  weekly: "еженедельно",
  monthly: "ежемесячно",
};

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body: { login?: string; mode?: string; hour?: number; day?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ code: "bad_request" }, { status: 400 }); }
  const login = String(body.login || "");
  const known = listUsers().some((u) => u.login === login);
  if (!known) {
    return NextResponse.json({ code: "not_found", message: "Пользователь не найден" }, { status: 404 });
  }
  const mode = MODES.includes(body.mode as ResetMode) ? (body.mode as ResetMode) : "off";
  const hour = Math.min(23, Math.max(0, Math.round(Number(body.hour ?? 0)) || 0));
  let day = Math.round(Number(body.day ?? 1)) || 1;
  if (mode === "weekly") day = Math.min(7, Math.max(1, day));
  else if (mode === "monthly") day = Math.min(28, Math.max(1, day));
  else day = 1;

  const cfg = setResetConfig(login, mode, hour, day);
  const session = await getSession(request);
  logEvent("auto_reset_set", session?.login || "admin", `${login}: авто-сброс ${MODE_LABEL[mode]}`);
  return NextResponse.json({
    ok: true,
    login,
    resetMode: cfg.mode,
    resetHour: cfg.hour,
    resetDay: cfg.day,
    nextResetAt: cfg.nextResetAt,
  });
}