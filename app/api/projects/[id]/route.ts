/**
 * /api/projects/[id] — переименование/архивация и удаление проекта.
 * PATCH {name?, archived?} → {project}
 * DELETE → {ok:true} (чаты и файлы отвязываются, не удаляются)
 * Auth: кука; только владелец проекта.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminAuth";
import { getProject, renameProject, setArchived, deleteProject } from "@/lib/projectStore";
import { logEvent } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!getProject(session.login, id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let body: { name?: unknown; archived?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (typeof body?.name === "string") {
    if (!renameProject(session.login, id, body.name)) {
      return NextResponse.json({ error: "bad_name" }, { status: 400 });
    }
  }
  if (typeof body?.archived === "boolean") {
    setArchived(session.login, id, body.archived);
  }
  logEvent("project_update", session.login, id);
  return NextResponse.json({ project: getProject(session.login, id) });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!getProject(session.login, id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  deleteProject(session.login, id);
  logEvent("project_delete", session.login, id);
  return NextResponse.json({ ok: true });
}
