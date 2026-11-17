import { NextRequest, NextResponse } from "next/server";

// TODO: заменить на проверку подписанного токена внешнего бэкенда (docs/design.md §9).
// Пока гейтвей сам выступает mock-эмитентом куки, чтобы фронт жил по реальному контракту.
const LOGIN = process.env.GTW_LOGIN ?? "demo";
const PASSWORD = process.env.GTW_PASSWORD ?? "demo";

export async function POST(request: NextRequest) {
  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "bad_request" }, { status: 400 });
  }

  if (body.login !== LOGIN || body.password !== PASSWORD) {
    return NextResponse.json(
      { code: "bad_credentials", message: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("gtw-auth", `mock.${Date.now()}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 дней, как в §9
  });
  return res;
}
