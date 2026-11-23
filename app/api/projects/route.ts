/**
 * /api/projects — список и создание проектов пользователя.
 * GET  → {projects:[{id,name,slug,archived,createdAt,updatedAt}]} (?archived=1 — с архивом)
 * POST {name} → {project} (201)
 * Auth: подписанная кука gtw-auth; проекты изолированы по login.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminAuth";
import { listProjects, createProject } from "@/lib/projectStore";
import { logEvent } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  return NextResponse.json({ projects: listProjects(session.login, includeArchived) });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "bad_name" }, { status: 400 });
  const project = createProject(session.login, name);
  logEvent("project_create", session.login, `${project.name} (${project.slug})`);
  return NextResponse.json({ project }, { status: 201 });
}
