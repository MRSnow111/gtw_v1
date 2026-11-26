/**
 * Пользователи GTW: env-аккаунт владельца + пользователи из SQLite.
 * Пароли — scrypt (N=16384) с индивидуальной солью; сравнение timing-safe.
 * Хеши никогда не покидают сервер.
 *
 * S4: currentRole() — единственный источник «актуальной роли» для сверки
 * сессионной куки на КАЖДОМ запросе (удалённый юзер → null → 401,
 * разжалованный админ → "user" → не админ-доступ).
 * S3: verifyUser выполняет фиктивный scrypt для неизвестного логина, чтобы
 * время ответа не выдавало существование учётки; сравнение env-паролей —
 * timingSafeEqual по буферам (secretEquals), не `===`.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { purgeUserStore } from "./fileStore";

export type Role = "admin" | "user";

export interface StoredUser {
  login: string;
  role: Role;
  createdAt: string;
  lastLogin: string | null;
  source: "env" | "db";
}

const ADMIN_LOGIN = process.env.GTW_LOGIN ?? "demo";
const LEGACY_USER_LOGIN = process.env.GTW_USER_LOGIN;

interface UserRow {
  login: string;
  role: Role;
  created_at: string;
  last_login: string | null;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

/**
 * S3.3: константный «жёлудь» — соль/хеш, против которых прогоняется scrypt,
 * когда логин не найден. Без этого неизвестный логин отвечал бы мгновенно и
 * по времени ответа перечислялся бы список пользователей.
 */
const DUMMY_SALT = randomBytes(16).toString("hex");
const DUMMY_HASH = hashPassword("gtw-timing-equalizer", DUMMY_SALT);

/** Выполняет настоящую scrypt-работу без результата (уравнивание времени). */
export function burnScrypt(password: string): void {
  const expected = Buffer.from(DUMMY_HASH, "hex");
  const actual = scryptSync(String(password || ""), DUMMY_SALT, 64);
  if (expected.length === actual.length) timingSafeEqual(expected, actual);
}

/**
 * S3.3: сравнение секретов за постоянное время по ДЛИНЕ (через SHA-256),
 * иначе `===` на строках разной длины утекает по времени/раннему выходу.
 */
export function secretEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  const ha = createHash("sha256").update(String(a ?? "")).digest();
  const hb = createHash("sha256").update(String(b ?? "")).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * S4: актуальная роль логина (env-админ / env-юзер / строка в users),
 * либо null — учётной записи больше нет. Используется для сверки куки
 * при каждом запросе: удалённый юзер теряет доступ немедленно, независимо
 * от того, что подпись куки ещё валидна и не просрочена.
 */
export function currentRole(login: string): Role | null {
  if (!login) return null;
  if (login === ADMIN_LOGIN) return "admin";
  if (LEGACY_USER_LOGIN && login === LEGACY_USER_LOGIN) return "user";
  const row = getDb()
    .prepare("SELECT role FROM users WHERE login = ?")
    .get(login) as { role: string } | undefined;
  if (!row) return null;
  return row.role === "admin" ? "admin" : "user";
}

export function listUsers(): StoredUser[] {
  const rows = getDb()
    .prepare("SELECT login, role, created_at, last_login FROM users ORDER BY created_at")
    .all() as UserRow[];
  const envAdmin: StoredUser = {
    login: ADMIN_LOGIN,
    role: "admin",
    createdAt: "",
    lastLogin: null,
    source: "env",
  };
  // env-пользователь (GTW_USER_LOGIN) — полноценный участник: его видно
  // в списке, ему можно ставить лимиты токенов; удалить/переименовать нельзя.
  const envUsers: StoredUser[] = [envAdmin];
  if (LEGACY_USER_LOGIN && LEGACY_USER_LOGIN !== ADMIN_LOGIN) {
    envUsers.push({ login: LEGACY_USER_LOGIN, role: "user", createdAt: "", lastLogin: null, source: "env" });
  }
  const dbUsers: StoredUser[] = rows
    .filter((r) => r.login !== ADMIN_LOGIN && r.login !== LEGACY_USER_LOGIN)
    .map((r) => ({
      login: r.login,
      role: r.role,
      createdAt: r.created_at,
      lastLogin: r.last_login,
      source: "db",
    }));
  return [...envUsers, ...dbUsers];
}

export function addUser(login: string, password: string, role: Role): StoredUser {
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(login)) {
    throw new Error("Логин: 2–32 символа, буквы/цифры/._-");
  }
  // S3.4: минимум 8 — ТОЛЬКО для создаваемых DB-пользователей. Env-пароль
  // владельца (GTW_PASSWORD) не валидируется: владелец сам решает, что ему
  // ставить, и блокировать вход дефолтным правилом нельзя.
  if (password.length < 8) {
    throw new Error("Пароль: минимум 8 символов");
  }
  if (role !== "admin" && role !== "user") {
    throw new Error("Неизвестная роль");
  }
  if (login === ADMIN_LOGIN || (LEGACY_USER_LOGIN && login === LEGACY_USER_LOGIN)) {
    throw new Error("Этот логин занят системным аккаунтом");
  }
  const exists = getDb().prepare("SELECT login FROM users WHERE login = ?").get(login);
  if (exists) {
    throw new Error("Пользователь уже существует");
  }
  const salt = randomBytes(16).toString("hex");
  const createdAt = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO users (login, pass_hash, salt, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(login, hashPassword(password, salt), salt, role, createdAt);
  return { login, role, createdAt, lastLogin: null, source: "db" };
}

/**
 * Волна 4 (A1, аудит server-core.md §2.6): пер-user таблицы, чистимые при
 * удалении аккаунта. Без каскада пересоздание того же логина молча
 * наследовало лимиты, белые списки, чужие чаты/файлы и расход токенов.
 * Схема сверена с src/lib/db.ts (таблицы messages нет).
 *   events  — журнал шлюза (аудит), НЕ чистится: запись «Удалён X» должна
 *             пережить удаление самой учётки;
 *   файлы на диске — удаляются вместе с реестром (policy владельца, волна 4):
 *             purgeUserStore после COMMIT транзакции.
 */
const USER_DATA_TABLES = [
  "user_limits",
  "user_models",
  "chats",
  "files",
  "usage_stats",
  "projects",
  "sessions",
] as const;

/** Суммарное число удалённых по login строк в пер-user таблицах (для каскада/теста). */
export function purgeUserData(login: string): number {
  const db = getDb();
  let removed = 0;
  // Имена таблиц — статический список выше, интерполяция безопасна.
  for (const table of USER_DATA_TABLES) {
    const r = db.prepare(`DELETE FROM ${table} WHERE login = ?`).run(login);
    removed += Number(r.changes);
  }
  return removed;
}

export function removeUser(login: string): boolean {
  if (login === ADMIN_LOGIN) {
    throw new Error("Системного администратора удалить нельзя");
  }
  const db = getDb();
  db.exec("BEGIN");
  try {
    purgeUserData(login);
    const res = db.prepare("DELETE FROM users WHERE login = ?").run(login);
    db.exec("COMMIT");
    const removed = Number(res.changes) > 0;
    // диск-файлы — после COMMIT и только если учётка реально существовала
    if (removed) purgeUserStore(login);
    return removed;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* соединение уже закрыто/транзакция сброшена — скрываем за первопричиной */
    }
    throw e;
  }
}

export function verifyUser(login: string, password: string): { login: string; role: Role } | null {
  const row = getDb()
    .prepare("SELECT login, role, pass_hash, salt FROM users WHERE login = ?")
    .get(login) as (UserRow & { pass_hash: string; salt: string }) | undefined;
  if (!row) {
    // S3.3: неизвестный логин стоит столько же, сколько известный (тот же
    // scrypt), иначе время ответа перечисляет пользователей по логину.
    burnScrypt(password);
    return null;
  }
  const expected = Buffer.from(row.pass_hash, "hex");
  const actual = scryptSync(password, row.salt, 64);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return { login: row.login, role: row.role };
}

export function touchLastLogin(login: string): void {
  getDb()
    .prepare("UPDATE users SET last_login = ? WHERE login = ?")
    .run(new Date().toISOString(), login);
}
