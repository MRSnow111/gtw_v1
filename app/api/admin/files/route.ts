import { NextRequest, NextResponse } from "next/server";

function requireAuth(request: NextRequest) {
  const auth = request.cookies.get("gtw-auth");
  if (!auth) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { mockFiles } = await import("@/data/mockAdminData");
  return NextResponse.json(mockFiles);
}
