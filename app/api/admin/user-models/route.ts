/**
 * Белый список моделей пользователя (только админ).
 * GET  — пользователи с их разрешёнными моделями (null = все разрешены).
 * POST { login, models: string[] | null } — установить/снять ограничение.
 *        models — строки "provider/model"; пусто/null = без ограничения.
 * Enforcement — в WS-прокси server.js (каталог, set_model, /model в чате).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSession } from "@/lib/adminAuth";
import { listUsers } from "@/lib/userStore";
import { getAllowlist, setAllowlist, allAllowlists } from "@/lib/modelStore";
import { logEvent } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const all = allAllowlists();
  const users = listUsers().map((u) => ({
    login: u.login,
    role: u.role,
    models: all[u.login] ?? getAllowlist(u.login),
  }));
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body: { login?: string; models?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "bad_request" }, { status: 400 });
  }
  const login = String(body.login || "").trim();
  if (!login || !listUsers().some((u) => u.login === login)) {
    return NextResponse.json({ code: "not_found", message: "Пользователь не найден" }, { status: 404 });
  }
  let models: string[] | null = null;
  if (body.models !== null && body.models !== undefined) {
    if (!Array.isArray(body.models)) {
      return NextResponse.json({ code: "bad_request", message: "models должен быть массивом строк" }, { status: 400 });
    }
    if (body.models.length > 500) {
      return NextResponse.json({ code: "bad_request", message: "Слишком много моделей (максимум 500)" }, { status: 400 });
    }
    const clean: string[] = [];
    for (const m of body.models) {
      if (typeof m !== "string" || !m.trim() || m.length > 200) {
        return NextResponse.json({ code: "bad_request", message: "Некорректный идентификатор модели" }, { status: 400 });
      }
      clean.push(m.trim());
    }
    models = clean.length ? clean : null;
  }
  setAllowlist(login, models);
  const session = await getSession(request);
  logEvent(
    "models_access_set",
    session?.login || "admin",
    models ? `${login}: ${models.length} моделей` : `${login}: все модели`
  );
  return NextResponse.json({ ok: true, login, models });
}
