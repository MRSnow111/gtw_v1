/**
 * Пользователи GTW: env-аккаунт владельца + пользователи из SQLite.
 * Пароли — scrypt (N=16384) с индивидуальной солью; сравнение timing-safe.
 * Хеши никогда не покидают сервер.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

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
  const dbUsers: StoredUser[] = rows
    .filter((r) => r.login !== ADMIN_LOGIN)
    .map((r) => ({
      login: r.login,
      role: r.role,
      createdAt: r.created_at,
      lastLogin: r.last_login,
      source: "db",
    }));
  return [envAdmin, ...dbUsers];
}

export function addUser(login: string, password: string, role: Role): StoredUser {
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(login)) {
    throw new Error("Логин: 2–32 символа, буквы/цифры/._-");
  }
  if (password.length < 4) {
    throw new Error("Пароль: минимум 4 символа");
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

export function removeUser(login: string): boolean {
  if (login === ADMIN_LOGIN) {
    throw new Error("Системного администратора удалить нельзя");
  }
  const res = getDb().prepare("DELETE FROM users WHERE login = ?").run(login);
  return Number(res.changes) > 0;
}

export function verifyUser(login: string, password: string): { login: string; role: Role } | null {
  const row = getDb()
    .prepare("SELECT login, role, pass_hash, salt FROM users WHERE login = ?")
    .get(login) as (UserRow & { pass_hash: string; salt: string }) | undefined;
  if (!row) return null;
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
