import { NextRequest, NextResponse } from "next/server";

// Middleware-проверка авторизации
function requireAuth(request: NextRequest) {
  const auth = request.cookies.get("gtw-auth");
  if (!auth) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  return null;
}

// Проверка роли admin
function requireAdmin(request: NextRequest) {
  const auth = request.cookies.get("gtw-auth");
  // В демо-режиме проверяем по значению куки (backend пока не выдаёт роли)
  // TODO: заменить на проверку подписанного токена с ролью
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { mockStats } = await import("@/data/mockAdminData");
  return NextResponse.json(mockStats);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { mockStats } = await import("@/data/mockAdminData");
  return NextResponse.json(mockStats);
}
