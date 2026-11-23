/**
 * DELETE /api/chats/[id] — удалить чат текущего логина из серверного реестра.
 * Удаление только в пределах своего логина (чужой chat_id не тронется).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminAuth";
import { deleteChat, moveChat } from "@/lib/chatStore";
import { getProject } from "@/lib/projectStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH {project_id: string|null} — переместить чат в проект / без проекта. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  let body: { project_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const projectId = body?.project_id ? String(body.project_id).slice(0, 64) : null;
  if (projectId && !getProject(session.login, projectId)) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }
  const ok = moveChat(session.login, String(id).slice(0, 120), projectId);
  return NextResponse.json({ ok });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  deleteChat(session.login, String(id).slice(0, 120));
  return NextResponse.json({ ok: true });
}