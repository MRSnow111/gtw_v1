import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Защита /chat*: без куки gtw-auth — редирект на / (docs/design.md §9).
// TODO: когда бэкенд начнёт выдавать подписанные токены — добавить проверку
// подписи вместо проверки наличия куки.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/chat")) {
    const auth = request.cookies.get("gtw-auth");
    if (!auth) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|public).*)"],
};
