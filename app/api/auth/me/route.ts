import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/authToken";

/** Текущая сессия по подписанной куке: { login, role } или 401. */
export async function GET(request: NextRequest) {
  const session = await verifySession(request.cookies.get("gtw-auth")?.value);
  if (!session) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ login: session.login, role: session.role });
}
