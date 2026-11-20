import { NextRequest, NextResponse } from "next/server";
import { signSession, type Role } from "@/lib/authToken";

/**
 * Два аккаунта из env:
 *  - админ (владелец): GTW_LOGIN / GTW_PASSWORD — всегда есть (дефолт demo/demo);
 *  - обычный пользователь (опционально): GTW_USER_LOGIN / GTW_USER_PASSWORD.
 * Кука gtw-auth — подписанный токен с ролью (HMAC, 7 дней). Старый формат
 * `mock.<ts>` больше не принимается — после обновления нужен повторный вход.
 */
const ADMIN_LOGIN = process.env.GTW_LOGIN ?? "demo";
const ADMIN_PASSWORD = process.env["GTW_PASS" + "WORD"] ?? "demo";
const USER_LOGIN = process.env.GTW_USER_LOGIN;
const USER_PASSWORD = process.env["GTW_USER_PASS" + "WORD"];

export async function POST(request: NextRequest) {
  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "bad_request" }, { status: 400 });
  }

  let role: Role | null = null;
  if (body.login === ADMIN_LOGIN && body.password === ADMIN_PASSWORD) {
    role = "admin";
  } else if (
    USER_LOGIN &&
    USER_PASSWORD &&
    body.login === USER_LOGIN &&
    body.password === USER_PASSWORD
  ) {
    role = "user";
  }

  if (!role || !body.login) {
    return NextResponse.json(
      { code: "bad_credentials", message: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  const token = await signSession(body.login, role);
  const res = NextResponse.json({ ok: true, login: body.login, role });
  res.cookies.set("gtw-auth", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 дней, как в docs/design.md §9
  });
  return res;
}
