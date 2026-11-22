/**
 * Единая точка доступа к данным GTW (SQLite, встроенный node:sqlite).
 * Файл БД: <GTW_DATA_DIR || cwd/data>/gtw.db. WAL — конкурентные чтения
 * не блокируют запись. При переезде на Postgres меняется только этот слой.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.GTW_DATA_DIR || path.join(process.cwd(), "data");

let db: DatabaseSync | null = null;

export function dataDir(): string {
  return DATA_DIR;
}

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(path.join(DATA_DIR, "gtw.db"));
    db.exec("PRAGMA journal_mode = WAL;");
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
    `);
  }
  return db;
}
