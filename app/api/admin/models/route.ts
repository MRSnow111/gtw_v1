/**
 * Контроль моделей (только админ): каталог провайдеров/моделей из ядра
 * и переключение модели чата командой /model через gtw-адаптер.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSession } from "@/lib/adminAuth";
import { gtwRequest } from "@/lib/gtwAdminWs";
import { logEvent } from "@/lib/activity";
import type { ModelProvider } from "@/types/events";

export const dynamic = "force-dynamic";

interface ModelsFrame {
  type: "models";
  chat_id: string;
  current: { model: string; provider: string };
  providers: ModelProvider[];
}
interface SetModelAck { type: "set_model_ack"; chat_id: string; model: string; ok: boolean }

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const chatId = request.nextUrl.searchParams.get("chatId") || request.nextUrl.searchParams.get("chat_id") || "main";
  const live = await gtwRequest<ModelsFrame>({ type: "models", chat_id: chatId }, "models", 15000);
  if (!live) {
    return NextResponse.json({ live: false, chatId, current: null, providers: [] });
  }
  return NextResponse.json({ live: true, chatId, current: live.current, providers: live.providers || [] });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body: { chatId?: string; model?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ code: "bad_request" }, { status: 400 }); }
  const chatId = String(body.chatId || "main");
  const model = String(body.model || "").trim();
  if (!model || model.length > 200 || model.includes("\n") || model.startsWith("/")) {
    return NextResponse.json({ code: "bad_request", message: "Некорректное имя модели" }, { status: 400 });
  }

  const ack = await gtwRequest<SetModelAck>({ type: "set_model", chat_id: chatId, model }, "set_model_ack", 15000);
  if (!ack) {
    return NextResponse.json({ code: "gateway_unavailable", message: "Шлюз недоступен" }, { status: 503 });
  }
  if (ack.ok) {
    const session = await getSession(request);
    logEvent("model_set", session?.login || "admin", `${chatId} → ${model}`);
  }
  return NextResponse.json({ ok: ack.ok, chatId, model });
}
