import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";


export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { mockPlugins } = await import("@/data/mockAdminData");
  return NextResponse.json(mockPlugins);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  const body = await request.json();

  // Toggle enabled/disabled
  return NextResponse.json({ ok: true, pluginId: id, enabled: body.enabled });
}
