/**
 * GET /api/chats — список чатов текущего логина (per-login, серверное хранение).
 * PUT /api/chats — создать/обновить чат {chat_id, title}.
 * Авторизация — подписанная кука gtw-auth; список фильтруется по логину,
 * поэтому чужие чаты не видны и список синхронен между устройствами.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminAuth";
import { listChats, upsertChat } from "@/lib/chatStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ chats: listChats(session.login) });
}

export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { chat_id?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const chatId = String(body?.chat_id ?? "").slice(0, 120);
  const title = String(body?.title ?? "Новый чат").slice(0, 200) || "Новый чат";
  if (!chatId) return NextResponse.json({ error: "chat_id_required" }, { status: 400 });
  upsertChat(session.login, chatId, title);
  return NextResponse.json({ ok: true });
}