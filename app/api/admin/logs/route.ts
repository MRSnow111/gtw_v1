import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";


export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const level = searchParams.get("level") || "";

  const { mockLogs } = await import("@/data/mockAdminData");

  // Filter by level
  const filtered = level ? mockLogs.filter((l) => l.level === level) : mockLogs;

  // Pagination
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginated = filtered.slice(start, end);

  return NextResponse.json({
    logs: paginated,
    total: filtered.length,
    page,
    limit,
    hasMore: end < filtered.length,
  });
}
