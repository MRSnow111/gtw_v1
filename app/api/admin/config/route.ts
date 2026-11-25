import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Волна 4 (A3): конфигурация шлюза задаётся env-файлом на сервере и НЕ
 * редактируется через веб. Ранее роут отдавал мок и принимал фиктивный
 * POST с тостом «успех». Ответ — честный 501; Admin-only guard сохранён
 * (нужна актуальная роль admin, иначе 401/403 до 501).
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
