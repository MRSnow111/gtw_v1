import { NextRequest, NextResponse } from "next/server";
import { verifySession, type SessionPayload } from "@/lib/authToken";
import { currentRole } from "@/lib/userStore";

/**
 * Сессия из подписанной куки gtw-auth с ОБЯЗАТЕЛЬНОЙ сверкой с хранилищем.
 *
 * S4: подпись и exp сами по себе не дают доступа — кука живёт 7 дней, а
 * учётная запись может быть удалена или разжалована на минуте. Семантика:
 *  - логина нет (не env-админ, не env-юзер, нет строки в users) → null → 401;
 *  - роль в куке расходится с актуальной → возвращаем АКТУАЛЬНУЮ роль
 *    (разжалованный админ перестаёт быть админом немедленно, без перевхода).
 * Роль из куки никогда не используется как источник истины для доступа.
 */
export async function resolveSession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  const session = await verifySession(token);
  if (!session) return null;
  const role = currentRole(session.login);
  if (!role) return null;
  return role === session.role ? session : { ...session, role };
}

export async function getSession(request: NextRequest): Promise<SessionPayload | null> {
  return resolveSession(request.cookies.get("gtw-auth")?.value);
}

/**
 * Проверка подписанной куки gtw-auth + роли admin для /api/admin/*.
 * null = доступ разрешён; иначе готовый ответ 401 (нет/невалидна/отозвана)
 * или 403 (не админ по АКТУАЛЬНОЙ роли).
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
