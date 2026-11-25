import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/authToken";

/**
 * S5 (CSRF): Origin мутирующего запроса должен совпадать с хостом сайта.
 * Без Origin (curl, стендовые скрипты, серверные вызовы) — не блокируем.
 * Кука SameSite=Lax уже не уходит cross-site fetchем; это второй слой.
 * Сравнение по hostname (порт за прокси может отсутствовать в Host).
 */
function originMismatch(request: NextRequest): boolean {
  const raw = request.headers.get("origin") || "";
  if (!raw) return false;
  let o: URL;
  try {
    o = new URL(raw);
  } catch {
    return true;
  }
  if (o.protocol !== "http:" && o.protocol !== "https:") return true;
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  return o.hostname.toLowerCase() !== host;
}

/**
 * Защита /chat* и /admin*: нужна валидная подписанная кука gtw-auth.
 * /admin* дополнительно требует роль admin; обычного пользователя — в /chat.
 * Живая сверка куки с учёткой (S4) — в роутах через getSession; middleware
 * работает на edge и проверяет только подпись (node:crypto там недоступен).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (originMismatch(request)) {
      return NextResponse.json({ code: "forbidden_origin" }, { status: 403 });
    }
  }

  if (pathname.startsWith("/chat") || pathname.startsWith("/admin")) {
    const session = await verifySession(
      request.cookies.get("gtw-auth")?.value
    );
    if (!session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (pathname.startsWith("/admin") && session.role !== "admin") {
      return NextResponse.redirect(new URL("/chat", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Исключаем _next, статику — middleware только для страниц и API.
     * api/files и api/admin/files исключены: multipart-загрузки десятков МБ
     * ломаются о буферизацию тела в middleware (bad_form). CSRF на этих
     * роутах прикрыт кукой SameSite=Lax (cross-site POST её не несёт).
     */
    "/((?!_next|favicon.ico|public|api/files|api/admin/files).*)",
  ],
};
