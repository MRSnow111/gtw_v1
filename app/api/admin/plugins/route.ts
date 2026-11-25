import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Волна 4 (A3): управление плагинами — через CLI `hermes plugins` на сервере
 * (plus код адаптера требует рестарта gateway). Мок-каталог и фиктивный
 * toggle удалены; ответ — честный 501; Admin-only guard сохранён.
 */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
