import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";



export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { mockStats } = await import("@/data/mockAdminData");
  return NextResponse.json(mockStats);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { mockStats } = await import("@/data/mockAdminData");
  return NextResponse.json(mockStats);
}
