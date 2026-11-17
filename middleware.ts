import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /chat routes — mock: always allow for now
  // Replace with real session/cookie check when backend is ready
  const isChatRoute = pathname.startsWith("/chat");
  if (isChatRoute) {
    const auth = request.cookies.get("gtw-auth");
    if (!auth) {
      // Mock: allow access until real auth is implemented
      // return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|public).*)"],
};
