import { NextRequest, NextResponse } from "next/server";
import { verifySession, type SessionPayload } from "@/lib/authToken";

/** Сессия из подписанной куки (или null). */
export async function getSession(request: NextRequest): Promise<SessionPayload | null> {
  return verifySession(request.cookies.get("gtw-auth")?.value);
}

/**
 * Проверка подписанной куки gtw-auth + роли admin для /api/admin/*.
 * null = доступ разрешён; иначе готовый ответ 401 (нет/невалидна) или 403 (не админ).
 */
export async function requireAdmin(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ code: "forbidden" }, { status: 403 });
  }
  return null;
}
