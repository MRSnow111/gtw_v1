import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { eventsPage } from "@/lib/activity";

export const dynamic = "force-dynamic";

/**
 * Волна 4 (A2): журнал на РЕАЛЬНЫХ событиях из таблицы events (src/lib/activity.ts)
 * вместо мока. Контракт для UI сохранён: {logs,total,page,limit,hasMore},
 * новые записи сверху. Хранение — не «30 дней»: logEvent подрезает журнал до
 * последних MAX_EVENTS (500) записей, это и есть фактический ротот.
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;
  const pageRaw = parseInt(searchParams.get("page") || "1", 10);
  const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const level = (searchParams.get("level") || "").trim().toLowerCase();

  const { rows, total } = eventsPage(page, limit, level);
  return NextResponse.json({
    logs: rows,
    total,
    page,
    limit,
    hasMore: (page - 1) * limit + rows.length < total,
  });
}
