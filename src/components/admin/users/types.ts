/**
 * Типы страницы /admin/users (волна 5, D1).
 *
 * Раньше вся страница жила на `any` (находка аудита: «типы есть, страница — нет»).
 * Контракты API НЕ изменены — это описание того, что уже отдают роуты:
 *   GET /api/admin/users      → AdminUser[]
 *   GET /api/admin/limits     → { users: (AdminUser & LimitInfo)[] }
 *   GET /api/admin/user-models→ { users: { login, models: string[]|null }[] }
 *   GET /api/admin/models     → { providers: CatalogProvider[] }
 */

export interface AdminUser {
  id: string;
  login: string;
  role: "admin" | "user" | string;
  /** Роут пока всегда отдаёт true (нет механизма отключения) — метрика-заглушка. */
  isActive: boolean;
  createdAt?: string;
  lastLogin?: string;
  /** "env" | "db": env-владелец не удаляется из интерфейса. */
  source?: string;
}

export interface LimitInfo {
  limit: number | null;
  used: number;
  resetMode: string;
  resetHour: number;
  resetDay: number;
  nextResetAt: string | null;
  lastResetAt: string | null;
}

export type ResetMode = "off" | "daily" | "weekly" | "monthly";

export interface CatalogProvider {
  name: string;
  label?: string;
  models: string[];
}

export const RESET_MODES: Array<[ResetMode, string]> = [
  ["off", "Выключен"],
  ["daily", "Ежедневно"],
  ["weekly", "Еженедельно"],
  ["monthly", "Ежемесячно"],
];
