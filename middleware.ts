import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/authToken";

/**
 * Защита /chat* и /admin*: нужна валидная подписанная кука gtw-auth.
 * /admin* дополнительно требует роль admin; обычного пользователя — в /chat.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
     * Исключаем _next, api, статику — middleware только для страниц.
     */
    "/((?!_next|api|favicon.ico|public).*)",
  ],
};
