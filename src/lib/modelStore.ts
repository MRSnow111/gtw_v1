/**
 * Белый список моделей пользователя (SQLite user_models).
 * Нет записи/пусто = разрешены все модели (обратная совместимость).
 * Записи — строки вида "provider/model" (как в кадре set_model и каталоге).
 * Серверный прокси (server.js) фильтрует каталог и блокирует переключение
 * на запрещённые модели (пикер, set_model, команда /model в тексте чата).
 */
import { getDb } from "@/lib/db";
import { modelAllowedCore } from "@/lib/gtwDb.mjs";

const now = () => new Date().toISOString();

/** null = без ограничения; иначе массив разрешённых "provider/model". */
export function getAllowlist(login: string): string[] | null {
  try {
    const row = getDb()
      .prepare("SELECT models FROM user_models WHERE login = ?")
      .get(login) as unknown as { models: string } | undefined;
    if (!row) return null;
    const arr = JSON.parse(row.models);
    return Array.isArray(arr) && arr.length > 0 ? arr.filter((x) => typeof x === "string") : null;
  } catch {
    return null;
  }
}

/** models=null/[] снимает ограничение; иначе сохраняет список. */
export function setAllowlist(login: string, models: string[] | null): void {
  const clean = (models || [])
    .filter((m) => typeof m === "string" && m.trim())
    .map((m) => m.trim());
  if (clean.length === 0) {
    getDb().prepare("DELETE FROM user_models WHERE login = ?").run(login);
    return;
  }
  getDb()
    .prepare(
      `INSERT INTO user_models (login, models, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(login) DO UPDATE SET models = excluded.models, updated_at = excluded.updated_at`
    )
    .run(login, JSON.stringify(clean), now());
}

export function allAllowlists(): Record<string, string[]> {
  try {
    const rows = getDb()
      .prepare("SELECT login, models FROM user_models")
      .all() as unknown as { login: string; models: string }[];
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      try {
        const arr = JSON.parse(r.models);
        if (Array.isArray(arr) && arr.length) out[r.login] = arr.filter((x) => typeof x === "string");
      } catch {
        /* битая запись — пропускаем */
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Разрешена ли модель. allowlist=null/[] => всё разрешено.
 * target — "provider/model" или голый "model" (матчим по суффиксу "/model").
 */
export function isModelAllowed(allowlist: string[] | null, target: string): boolean {
  // Ядро матчера — общее с server.js (gtwDb.cjs), чтобы копии не расходились.
  return modelAllowedCore(allowlist, target);
}
