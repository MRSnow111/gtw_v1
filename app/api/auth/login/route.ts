import { NextRequest, NextResponse } from "next/server";
import { signSession, type Role } from "@/lib/authToken";
import { verifyUser, touchLastLogin, burnScrypt, secretEquals } from "@/lib/userStore";
import { openSession, logEvent } from "@/lib/activity";

/**
 * Два аккаунта из env:
 *  - админ (владелец): GTW_LOGIN / GTW_PASSWORD — всегда есть (в dev дефолт demo/demo);
 *  - обычный пользователь (опционально): GTW_USER_LOGIN / GTW_USER_PASSWORD.
 * Кука gtw-auth — подписанный токен с ролью (HMAC, 7 дней). Старый формат
 * `mock.<ts>` больше не принимается — после обновления нужен повторный вход.
 *
 * S3 (логин-харддинг):
 *  1. fail-fast конфигурации: в production без env-пароля владельца вход
 *     запрещён (500 config_error) — demo/demo не должен пускать никого;
 *     в dev дефолт demo/demo сохраняется ради стенда/локальной разработки;
 *  2. rate-limit: >10 неудач на связку IP+логин за 15 минут -> 429
 *     rate_limited; протухшие записи вычищаются, успешный вход сбрасывает;
 *  3. тайминги: неизвестный логин тоже считает scrypt (burnScrypt), а
 *     env-пароли сравниваются через timingSafeEqual по SHA-256-дайджестам
 *     (secretEquals) — ответ не различается по времени и не перечисляет учётки;
 *  4. минимальная длина 8 символов — только при создании/смене пароля
 *     DB-пользователя (src/lib/userStore.ts addUser); env-пароль владельца
 *     не валидируется.
 */
const IS_PROD = process.env.NODE_ENV === "production";
const ADMIN_LOGIN = process.env.GTW_LOGIN ?? "demo";
const ADMIN_PASSWORD = process.env["GTW_PASSWORD"];
const USER_LOGIN = process.env.GTW_USER_LOGIN;
const USER_PASSWORD = process.env["GTW_USER_PASSWORD"];
// В dev (без env-пароля) остаётся исторический демо-вход demo/demo.
const ADMIN_PASSWORD_EFF = ADMIN_PASSWORD ?? "demo";

// -- S3.2 rate-limit: in-memory, фронт — один Node-процесс (как Map сессий в activity) --
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const attempts = new Map<string, number[]>();

function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "local";
}

/** Выкидывает протухшие окна — иначе Map растёт без потолка. */
function purgeStale(now: number): void {
  for (const [key, list] of attempts) {
    const fresh = list.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) attempts.delete(key);
    else if (fresh.length !== list.length) attempts.set(key, fresh);
  }
}

function failCount(key: string, now: number): number {
  return (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS).length;
}

function recordFail(key: string, now: number): void {
  const list = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  attempts.set(key, list);
}

function resetFails(key: string): void {
  attempts.delete(key);
}

export async function POST(request: NextRequest) {
  // S3.1: боевой инстанс без пароля владельца — ошибка конфигурации, а не
  // «демо-вход». Развёртывание без GTW_PASSWORD не должно пускать demo/demo.
  if (IS_PROD && !ADMIN_PASSWORD) {
    console.error(
      "[gtw] login disabled: production requires " + "GTW_" + "PASSWORD" + " to be set"
    );
    return NextResponse.json(
      { code: "config_error", message: "Сервер настроен неверно: не задан пароль владельца" },
      { status: 500 }
    );
  }

  let body: { login?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "bad_request" }, { status: 400 });
  }

  const login = typeof body.login === "string" ? body.login : "";
  const password = typeof body.password === "string" ? body.password : "";
  const now = Date.now();
  const key = clientIp(request) + "|" + login;
  purgeStale(now);

  if (failCount(key, now) > MAX_FAILS) {
    logEvent("login_rate_limited", login || "?", "Превышен лимит неудачных попыток");
    return NextResponse.json(
      { code: "rate_limited", message: "Слишком много неудачных попыток. Подождите 15 минут." },
      { status: 429 }
    );
  }

  let role: Role | null = null;
  if (login === ADMIN_LOGIN && secretEquals(password, ADMIN_PASSWORD_EFF)) {
    role = "admin";
  } else if (USER_LOGIN && USER_PASSWORD && login === USER_LOGIN && secretEquals(password, USER_PASSWORD)) {
    role = "user";
  }

  // Пользователи, созданные в админке (SQLite, scrypt-проверка).
  // S3.3: verifyUser сам прогоняет фиктивный scrypt для неизвестного логина,
  // поэтому «нет учётки» и «неверный пароль» идут за одно время.
  if (!role && login && password) {
    const dbUser = verifyUser(login, password);
    if (dbUser) {
      role = dbUser.role;
      touchLastLogin(login);
    }
  }

  // Env-логин с неверным паролем тоже должен «думать» столько же, сколько scrypt.
  if (!role && login && (login === ADMIN_LOGIN || (USER_LOGIN && login === USER_LOGIN))) {
    burnScrypt(password || "gtw-empty");
  }

  if (!role || !login) {
    recordFail(key, now);
    logEvent("login_fail", login || "?", "Неверный логин или пароль");
    return NextResponse.json(
      { code: "bad_credentials", message: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  resetFails(key);
  openSession(login, role);
  logEvent("login_ok", login, "Роль: " + role);
  const token = await signSession(login, role);
  const res = NextResponse.json({ ok: true, login, role });
  res.cookies.set("gtw-auth", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 дней, как в docs/design.md §9
  });
  return res;
}
