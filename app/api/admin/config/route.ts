import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";


export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { mockConfig } = await import("@/data/mockAdminData");
  return NextResponse.json(mockConfig);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const body = await request.json();
  // TODO: валидация и сохранение на бэкенде
  return NextResponse.json({ ok: true, updated: body.key });
}
