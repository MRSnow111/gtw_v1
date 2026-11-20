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
    `);
  }
  return db;
}
