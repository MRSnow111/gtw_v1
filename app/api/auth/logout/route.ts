import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/authToken";
import { closeSession, logEvent } from "@/lib/activity";

export async function POST(request: NextRequest) {
  const session = await verifySession(request.cookies.get("gtw-auth")?.value);
  if (session) {
    closeSession(session.login);
    logEvent("logout", session.login);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("gtw-auth", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
