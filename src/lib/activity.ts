/**
 * Активность GTW: сессии входов и журнал событий (SQLite).
 * Сессия = вход пользователя; last_seen обновляется при обращении к /api/auth/me.
 * Активной считается сессия с активностью за последние ACTIVE_WINDOW_MIN минут.
 * Журнал ограничен последними MAX_EVENTS записями.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "./db";

const ACTIVE_WINDOW_MIN = 15;
const MAX_EVENTS = 500;

const now = () => new Date().toISOString();

export function openSession(login: string, role: string): void {
  const ts = now();
  getDb()
    .prepare("INSERT INTO sessions (id, login, role, started_at, last_seen) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID(), login, role, ts, ts);
}

export function touchSession(login: string): void {
  getDb()
    .prepare(
      `UPDATE sessions SET last_seen = ?
       WHERE id = (SELECT id FROM sessions WHERE login = ? AND closed_at IS NULL
                   ORDER BY started_at DESC LIMIT 1)`
    )
    .run(now(), login);
}

export function closeSession(login: string): void {
  getDb()
    .prepare("UPDATE sessions SET closed_at = ? WHERE login = ? AND closed_at IS NULL")
    .run(now(), login);
}

export function logEvent(kind: string, login: string, detail = ""): void {
  getDb()
    .prepare("INSERT INTO events (ts, kind, login, detail) VALUES (?, ?, ?, ?)")
    .run(now(), kind, login, detail);
  getDb()
    .prepare(`DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT ${MAX_EVENTS})`)
    .run();
}

export interface SessionRow {
  login: string;
  role: string;
  startedAt: string;
  lastSeen: string;
  active: boolean;
}

export function recentSessions(limit = 10): SessionRow[] {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60_000).toISOString();
  const rows = getDb()
    .prepare("SELECT login, role, started_at, last_seen, closed_at FROM sessions ORDER BY started_at DESC LIMIT ?")
    .all(limit) as { login: string; role: string; started_at: string; last_seen: string; closed_at: string | null }[];
  return rows.map((r) => ({
    login: r.login,
    role: r.role,
    startedAt: r.started_at,
    lastSeen: r.last_seen,
    active: r.closed_at === null && r.last_seen >= cutoff,
  }));
}

export function activeSessionCount(): number {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60_000).toISOString();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE closed_at IS NULL AND last_seen >= ?")
    .get(cutoff) as { n: number };
  return row.n;
}

export function totalSessionCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
  return row.n;
}

export interface EventRow {
  ts: string;
  kind: string;
  login: string;
  detail: string;
}

export function recentEvents(limit = 15): EventRow[] {
  return getDb()
    .prepare("SELECT ts, kind, login, detail FROM events ORDER BY id DESC LIMIT ?")
    .all(limit) as EventRow[];
}

// ── Волна 4 (A2): админский журнал на реальных событиях ──

export type EventLevel = "info" | "warn" | "error" | "debug";

interface EventMeta {
  level: EventLevel;
  label: string;
  source: string;
}

/**
 * Человекочитаемое описание известных видов событий. Всё, чего нет здесь,
 * уходит в UI как info/gateway с сырым kind — честная деградация вместо
 * фейковых логов. Уровней error/debug пока нет у реальных источников
 * (логин/файлы/проекты/лимиты) — фильтр остаётся рабочим на будущее.
 */
const EVENT_META: Record<string, EventMeta> = {
  login_ok: { level: "info", label: "Успешный вход", source: "auth" },
  login_fail: { level: "warn", label: "Неудачный вход", source: "auth" },
  login_rate_limited: { level: "warn", label: "Сработал лимит неудачных входов", source: "auth" },
  logout: { level: "info", label: "Выход", source: "auth" },
  file_upload: { level: "info", label: "Файл загружен", source: "files" },
  file_delete: { level: "info", label: "Файл удалён", source: "files" },
  file_saved: { level: "info", label: "Файл сохранён (админ)", source: "files" },
  file_deleted: { level: "info", label: "Файл удалён (админ)", source: "files" },
  project_create: { level: "info", label: "Проект создан", source: "projects" },
  project_update: { level: "info", label: "Проект обновлён", source: "projects" },
  project_delete: { level: "info", label: "Проект удалён", source: "projects" },
  user_created: { level: "info", label: "Пользователь создан", source: "users" },
  user_deleted: { level: "info", label: "Пользователь удалён", source: "users" },
  limit_set: { level: "info", label: "Лимит токенов изменён", source: "limits" },
  usage_reset: { level: "info", label: "Расход обнулён", source: "limits" },
  auto_reset_set: { level: "info", label: "Авто-сброс расхода", source: "limits" },
  models_access_set: { level: "info", label: "Белый список моделей", source: "models" },
  model_set: { level: "info", label: "Модель переключена", source: "models" },
};

const DEFAULT_META: EventMeta = { level: "info", label: "Событие", source: "gateway" };

/** kinds с уровнем, отличным от info (для фильтра level=info через NOT IN). */
const NON_INFO_KINDS = Object.entries(EVENT_META)
  .filter(([, m]) => m.level !== "info")
  .map(([k]) => k);

export interface AdminLogRow {
  id: string;
  timestamp: string;
  level: EventLevel;
  message: string;
  source: string;
  kind: string;
  login: string;
}

function toLogRow(row: EventRow & { id: number }): AdminLogRow {
  const meta = EVENT_META[row.kind] ?? DEFAULT_META;
  return {
    id: String(row.id),
    timestamp: row.ts,
    level: meta.level,
    message: meta.label + " — " + row.login + (row.detail ? " (" + row.detail + ")" : ""),
    source: meta.source,
    kind: row.kind,
    login: row.login,
  };
}

/**
 * Страница админского журнала из реальной таблицы events, новые сверху.
 * level: "" | info | warn | error | debug ("" = все). Неизвестный уровень
 * (не info/warn/error/debug) даёт пустую страницу — как и раньше по фильтру.
 */
export function eventsPage(
  page: number,
  limit: number,
  level = ""
): { rows: AdminLogRow[]; total: number } {
  const db = getDb();
  let where = "";
  const params: (string | number)[] = [];
  if (level) {
    if (level === "info") {
      if (NON_INFO_KINDS.length) {
        where = `WHERE kind NOT IN (${NON_INFO_KINDS.map(() => "?").join(", ")})`;
        params.push(...NON_INFO_KINDS);
      }
    } else {
      const kinds = Object.entries(EVENT_META)
        .filter(([, m]) => m.level === level)
        .map(([k]) => k);
      if (!kinds.length) return { rows: [], total: 0 };
      where = `WHERE kind IN (${kinds.map(() => "?").join(", ")})`;
      params.push(...kinds);
    }
  }
  const { n } = db
    .prepare(`SELECT COUNT(*) AS n FROM events ${where}`)
    .get(...params) as { n: number };
  const offset = (page - 1) * limit;
  const rows = db
    .prepare(`SELECT id, ts, kind, login, detail FROM events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as (EventRow & { id: number })[];
  return { rows: rows.map(toLogRow), total: Number(n) };
}

export function failedLoginsSince(hours = 24): number {
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'login_fail' AND ts >= ?")
    .get(cutoff) as { n: number };
  return row.n;
}
