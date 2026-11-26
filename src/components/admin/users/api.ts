/**
 * Тонкие fetch-обёртки страницы /admin/users (волна 5, D1).
 * Контракты роутов не менялись: те же URL, методы, тела и форма ошибок
 * `{ code, message }`.
 */
import type { AdminUser, CatalogProvider, LimitInfo } from "./types";

export interface ApiResult {
  ok: boolean;
  message?: string;
}

async function send(url: string, init?: RequestInit): Promise<ApiResult & { data?: any }> {
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, message: data?.message, data };
  } catch {
    return { ok: false, message: undefined };
  }
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/* ── чтение ── */

export async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/users");
  return res.json();
}

export interface LimitsPayload {
  users?: Array<{ login: string } & Partial<LimitInfo>>;
}

export async function fetchLimits(): Promise<LimitsPayload | null> {
  try {
    const res = await fetch("/api/admin/limits");
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchUserModels(): Promise<{ login: string; models: string[] | null }[]> {
  try {
    const res = await fetch("/api/admin/user-models");
    const d = await res.json();
    return d.users || [];
  } catch {
    return [];
  }
}

export async function fetchCatalog(): Promise<CatalogProvider[]> {
  const res = await fetch("/api/admin/models");
  const d = await res.json();
  return d.providers || [];
}

/* ── запись ── */

export const saveLimitApi = (login: string, tokenLimit: number) =>
  send("/api/admin/limits", json({ login, tokenLimit }));

export const resetUsageApi = (login: string) => send("/api/admin/limits/reset", json({ login }));

export const saveAutoResetApi = (
  login: string,
  mode: string,
  hour: number,
  day: number,
) => send("/api/admin/limits/auto", json({ login, mode, hour, day }));

export const saveUserModelsApi = (login: string, models: string[] | null) =>
  send("/api/admin/user-models", json({ login, models }));

export const createUserApi = (login: string, password: string, role: string) =>
  send("/api/admin/users", json({ login, password, role }));

export const deleteUserApi = (id: string) =>
  send(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
