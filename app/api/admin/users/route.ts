import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getSession } from "@/lib/adminAuth";
import { listUsers, addUser, removeUser, type Role } from "@/lib/userStore";
import { logEvent } from "@/lib/activity";

// GET /api/admin/users — env-владелец + пользователи из SQLite (без хешей).
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const users = listUsers().map((u) => ({
    id: u.login,
    login: u.login,
    role: u.role,
    isActive: true,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin ?? "—",
    source: u.source,
  }));
  return NextResponse.json(users);
}

// POST /api/admin/users — реальное создание: {login, password, role}.
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => null);
  if (!body?.login || !body?.password) {
    return NextResponse.json({ code: "bad_request", message: "Нужны логин и пароль" }, { status: 400 });
  }
  try {
    const user = addUser(String(body.login), String(body.password), (body.role ?? "user") as Role);
    const actor = (await getSession(request))?.login ?? "?";
    logEvent("user_created", actor, `Создан ${user.login} (${user.role})`);
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { code: "bad_request", message: e instanceof Error ? e.message : "Не удалось создать" },
      { status: 400 }
    );
  }
}

// DELETE /api/admin/users?id=<login>
export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ code: "bad_request", message: "Не указан логин" }, { status: 400 });
  }
  try {
    const removed = removeUser(id);
    if (!removed) {
      return NextResponse.json({ code: "not_found", message: "Пользователь не найден" }, { status: 404 });
    }
    const actor = (await getSession(request))?.login ?? "?";
    logEvent("user_deleted", actor, `Удалён ${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { code: "bad_request", message: e instanceof Error ? e.message : "Не удалось удалить" },
      { status: 400 }
    );
  }
}
