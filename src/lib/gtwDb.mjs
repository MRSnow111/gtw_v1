/**
 * GTW: единый слой SQLite (волна 5, K1).
 *
 * Раньше server.js и src/lib/db.ts держали ДВА независимых соединения и ДВЕ
 * полные копии схемы+миграций+бизнес-SQL (аудит server-core.md §2.8/§3.1) —
 * дрейф схем уже приводил к расхождению isModelAllowed. Теперь схема,
 * миграции и общие запросы живут здесь; оба потребителя вызывают этот модуль.
 * Соединений по-прежнему два (server.js + Next-роуты в одном процессе) —
 * WAL + busy_timeout делают конкурентную запись безопасной.
 *
 * ESM (.mjs): TurbopackExternals для node:sqlite; server.js грузит через
 * require(ESM) — Node >= 22.12 (прод 22.22). Типы для TS — gtwDb.d.mts.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Идемпотентная миграция: добавить колонку, если её ещё нет. */
export function addColumnIfMissing(db, table, column, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

/**
 * Открыть <dataDir>/gtw.db: WAL, busy_timeout=5000 (защита от SQLITE_BUSY при
 * конкурентной записи двух соединений), полная схема (9 таблиц) + миграции.
 * Идемпотентно (CREATE TABLE IF NOT EXISTS / addColumnIfMissing).
 */
export function openGtwDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "gtw.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      login      TEXT PRIMARY KEY,
      pass_hash  TEXT NOT NULL,
      salt       TEXT NOT NULL,
      role       TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      created_at TEXT NOT NULL,
      last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      login      TEXT NOT NULL,
      role       TEXT NOT NULL,
      started_at TEXT NOT NULL,
      last_seen  TEXT NOT NULL,
      closed_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_login ON sessions (login, closed_at);
    CREATE TABLE IF NOT EXISTS events (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      ts     TEXT NOT NULL,
      kind   TEXT NOT NULL,
      login  TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS usage_stats (
      chat_id    TEXT PRIMARY KEY,
      login      TEXT NOT NULL DEFAULT '',
      model      TEXT NOT NULL DEFAULT '',
      provider   TEXT NOT NULL DEFAULT '',
      tokens_in  INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      turns      INTEGER NOT NULL DEFAULT 0,
      tools      INTEGER NOT NULL DEFAULT 0,
      speed      REAL,
      source     TEXT NOT NULL DEFAULT 'unknown',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_login ON usage_stats (login);
    CREATE TABLE IF NOT EXISTS user_limits (
      login       TEXT PRIMARY KEY,
      token_limit INTEGER,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_models (
      login      TEXT PRIMARY KEY,
      models     TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
      id           TEXT PRIMARY KEY,
      login        TEXT NOT NULL,
      chat_id      TEXT NOT NULL DEFAULT '',
      project_id   TEXT,
      direction    TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      name         TEXT NOT NULL,
      mime         TEXT NOT NULL DEFAULT 'application/octet-stream',
      size         INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_files_login ON files (login, created_at);
    CREATE INDEX IF NOT EXISTS idx_files_chat ON files (chat_id);
    CREATE TABLE IF NOT EXISTS chats (
      login      TEXT NOT NULL,
      chat_id    TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT 'Новый чат',
      project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (login, chat_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chats_login ON chats (login, updated_at);
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      login      TEXT NOT NULL,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL,
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects (login, slug);
    CREATE INDEX IF NOT EXISTS idx_projects_login ON projects (login, updated_at);
  `);
  // Миграция существующих БД: колонки project_id могли отсутствовать.
  addColumnIfMissing(db, "chats", "project_id", "TEXT");
  addColumnIfMissing(db, "files", "project_id", "TEXT");
  // Сброс расхода: offset + конфиг авто-сброса.
  addColumnIfMissing(db, "user_limits", "usage_offset", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "user_limits", "reset_mode", "TEXT NOT NULL DEFAULT 'off'");
  addColumnIfMissing(db, "user_limits", "reset_hour", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "user_limits", "reset_day", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(db, "user_limits", "next_reset_at", "TEXT");
  addColumnIfMissing(db, "user_limits", "last_reset_at", "TEXT");
  return db;
}

/**
 * Снимок счётчиков агента по чату (кумулятивный, перезатирается session_info).
 * Пустые login/model/provider НЕ перетирают уже записанные. Числа клампятся.
 * r — snake_case поля строки usage_stats (tokens_in/tokens_out уже числа).
 */
export function upsertUsageRow(db, r) {
  db.prepare(
    `INSERT INTO usage_stats (chat_id, login, model, provider, tokens_in, tokens_out, turns, tools, speed, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       login = CASE WHEN excluded.login != '' THEN excluded.login ELSE usage_stats.login END,
       model = CASE WHEN excluded.model != '' THEN excluded.model ELSE usage_stats.model END,
       provider = CASE WHEN excluded.provider != '' THEN excluded.provider ELSE usage_stats.provider END,
       tokens_in = excluded.tokens_in, tokens_out = excluded.tokens_out,
       turns = excluded.turns, tools = excluded.tools,
       speed = excluded.speed, source = excluded.source, updated_at = excluded.updated_at`
  ).run(
    r.chat_id, r.login, r.model, r.provider,
    Math.max(0, Math.round(r.tokens_in || 0)), Math.max(0, Math.round(r.tokens_out || 0)),
    Math.max(0, Math.round(r.turns || 0)), Math.max(0, Math.round(r.tools || 0)),
    r.speed ?? null, r.source || "unknown", r.updated_at || new Date().toISOString()
  );
}

/** «Сырая» сумма токенов логина по снапшотам (без offset). */
export function rawTotalForLogin(db, login) {
  const r = db
    .prepare("SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS t FROM usage_stats WHERE login = ?")
    .get(login);
  return Number((r && r.t) || 0);
}

/** Offset сброса: сколько токенов «списано» при последнем сбросе расхода. */
export function usageOffsetForLogin(db, login) {
  const r = db.prepare("SELECT usage_offset FROM user_limits WHERE login = ?").get(login);
  return Number((r && r.usage_offset) || 0);
}

/** Расход логина с учётом offset: used = MAX(0, SUM(tokens) - usage_offset). */
export function usedForLogin(db, login) {
  return Math.max(0, rawTotalForLogin(db, login) - usageOffsetForLogin(db, login));
}

/**
 * Сброс расхода: offset = текущая сумма (снапшоты не трогаем).
 * Лимит и конфиг авто-сброса сохраняются. Возвращает записанный offset.
 */
export function resetUsageOffset(db, login) {
  const total = rawTotalForLogin(db, login);
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT login FROM user_limits WHERE login = ?").get(login);
  if (existing) {
    db.prepare(
      "UPDATE user_limits SET usage_offset = ?, last_reset_at = ?, updated_at = ? WHERE login = ?"
    ).run(total, now, now, login);
  } else {
    db.prepare(
      "INSERT INTO user_limits (login, token_limit, usage_offset, last_reset_at, updated_at) VALUES (?, NULL, ?, ?, ?)"
    ).run(login, total, now, now);
  }
  return total;
}

/**
 * Ближайший авто-сброс строго после fromMs (UTC), в миллисекундах.
 * daily — каждый день в hour:00; weekly — day 1=Пн..7=Вс; monthly — day 1-28.
 * null для mode='off'. Чистая функция (Date-обёртки у потребителей).
 */
export function computeNextResetMs(mode, hour, day, fromMs) {
  if (mode === "off") return null;
  const h = Math.min(23, Math.max(0, Math.floor(hour)));
  const at = (ms) => {
    const x = new Date(ms);
    x.setUTCHours(h, 0, 0, 0);
    return x.getTime();
  };
  if (mode === "daily") {
    let cand = at(fromMs);
    if (cand <= fromMs) cand += 86400000;
    return cand;
  }
  if (mode === "weekly") {
    const target = (Math.min(7, Math.max(1, Math.floor(day))) - 1) % 7; // 0=Пн..6=Вс
    const jsTarget = (target + 1) % 7; // JS: 0=Вс..6=Сб
    let cand = at(fromMs);
    for (let i = 0; i < 8; i++) {
      if (new Date(cand).getUTCDay() === jsTarget && cand > fromMs) return cand;
      cand += 86400000;
    }
    return cand;
  }
  const dom = Math.min(28, Math.max(1, Math.floor(day)));
  const d = new Date(at(fromMs));
  d.setUTCDate(dom);
  if (d.getTime() <= fromMs) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(dom);
  }
  return d.getTime();
}

/** Лимит логина: NULL/<=0 => null (без лимита). */
export function limitForLogin(db, login) {
  const r = db.prepare("SELECT token_limit FROM user_limits WHERE login = ?").get(login);
  if (!r || r.token_limit === null || r.token_limit <= 0) return null;
  return r.token_limit;
}

/**
 * Ядро матчера белого списка (без нормализации имён — она у потребителей):
 * allowlist=null/[] => всё разрешено; точное совпадение "provider/model"
 * либо суффикс "/model" для голого имени.
 */
export function modelAllowedCore(allow, target) {
  if (!allow || !allow.length) return true;
  const t = String(target || "").trim();
  if (!t) return false;
  if (allow.includes(t)) return true;
  if (!t.includes("/")) return allow.some((a) => a.endsWith("/" + t));
  return false;
}

/** Суммарный расход ВСЕХ логинов с учётом offset каждого (для totals админки). */
export function grandUsedTokens(db) {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(used), 0) AS t FROM (
         SELECT MAX(0, SUM(u.tokens_in + u.tokens_out) - COALESCE(l.usage_offset, 0)) AS used
         FROM usage_stats u LEFT JOIN user_limits l ON l.login = u.login
         GROUP BY u.login
       )`
    )
    .get();
  return Number((r && r.t) || 0);
}

