/**
 * DELETE /api/chats/[id] — удалить чат текущего логина из серверного реестра.
 * Удаление только в пределах своего логина (чужой chat_id не тронется).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminAuth";
import { deleteChat } from "@/lib/chatStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  deleteChat(session.login, String(id).slice(0, 120));
  return NextResponse.json({ ok: true });
}