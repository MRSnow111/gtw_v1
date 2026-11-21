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

export function failedLoginsSince(hours = 24): number {
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'login_fail' AND ts >= ?")
    .get(cutoff) as { n: number };
  return row.n;
}
