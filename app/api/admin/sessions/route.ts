import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";


export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { mockSessions } = await import("@/data/mockAdminData");
  return NextResponse.json(mockSessions);
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ code: "bad_request" }, { status: 400 });

  return NextResponse.json({ ok: true, closed: id });
}
