/**
 * Единая точка доступа к данным GTW (SQLite, встроенный node:sqlite).
 * Файл БД: <GTW_DATA_DIR || cwd/data>/gtw.db.
 *
 * Волна 5 (K1): схема, миграции и общие бизнес-запросы вынесены в gtwDb.cjs —
 * ЕДИНЫЙ источник для этого модуля и server.js (раньше были две копии,
 * дрейф приводил к расхождениям). WAL + busy_timeout — в openGtwDb.
 * При переезде на Postgres меняется только этот слой.
 */
import type { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { openGtwDb } from "./gtwDb.mjs";

const DATA_DIR = process.env.GTW_DATA_DIR || path.join(process.cwd(), "data");

let db: DatabaseSync | null = null;

export function dataDir(): string {
  return DATA_DIR;
}

export function getDb(): DatabaseSync {
  if (!db) db = openGtwDb(DATA_DIR);
  return db;
}