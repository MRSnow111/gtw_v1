/**
 * Файловое хранилище GTW: единый реестр `files` + стор на диске.
 *
 * Стор: <GTW_FILESTORE_DIR || GTW_DATA_DIR/filestore>/<login>/<id>/<safeName>.
 * Отдача ТОЛЬКО по id из реестра с проверкой владельца (никакого доступа по
 * сырому пути). Защита от path traversal: имя санитизируется, storage_path
 * проверяется на принадлежность стору. Лимит размера — MAX_FILE_SIZE.
 *
 * Тот же layout и таблицу использует server.js (перехват artifact-кадров),
 * поэтому раздача через storage_path из реестра едина для upload и артефактов.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb, dataDir } from "./db";

/** Лимит на один файл (MVP). */
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 МБ

export function fileStoreRoot(): string {
  return process.env.GTW_FILESTORE_DIR || path.join(/*turbopackIgnore: true*/ dataDir(), "filestore");
}

/** login → безопасный компонент пути (кука подписана, но перестрахуемся). */
export function sanitizeLogin(login: string): string {
  return String(login || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "user";
}

/** Имя файла → безопасное: без путей/управляющих символов, с расширением. */
export function sanitizeName(name: string): string {
  let base = String(name || "").split(/[\\/]/).pop() || "file";
  base = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120);
  if (!base || base === "." || base === "..") base = "file";
  return base;
}

const MIME: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", csv: "text/csv", log: "text/plain",
  json: "application/json", xml: "application/xml", yaml: "application/yaml", yml: "application/yaml",
  js: "text/javascript", mjs: "text/javascript", ts: "text/typescript", tsx: "text/typescript",
  jsx: "text/javascript", py: "text/x-python", rb: "text/x-ruby", go: "text/x-go",
  rs: "text/x-rust", java: "text/x-java", c: "text/x-c", h: "text/x-c", cpp: "text/x-c++",
  sh: "text/x-shellscript", html: "text/html", htm: "text/html", css: "text/css",
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation", rtf: "application/rtf", epub: "application/epub+zip",
  zip: "application/zip", gz: "application/gzip", tar: "application/x-tar", "7z": "application/x-7z-compressed",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

export function guessMime(name: string): string {
  const ext = path.extname(String(name || "")).toLowerCase().replace(/^\./, "");
  return MIME[ext] || "application/octet-stream";
}

export function newFileId(): string {
  return randomUUID();
}

export interface FileRow {
  id: string;
  login: string;
  chat_id: string;
  project_id: string | null;
  direction: "in" | "out";
  name: string;
  mime: string;
  size: number;
  storage_path: string;
  created_at: string;
}

export interface RegisterInput {
  id: string;
  login: string;
  chat_id?: string;
  project_id?: string | null;
  direction: "in" | "out";
  name: string;
  mime?: string;
  size: number;
  storage_path: string;
}

/** Записать байты в стор, вернуть абсолютный storage_path. */
export async function writeStoreFile(
  login: string,
  id: string,
  name: string,
  data: Buffer
): Promise<string> {
  const dir = path.join(/*turbopackIgnore: true*/ fileStoreRoot(), sanitizeLogin(login), id);
  await fsp.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const full = path.join(dir, sanitizeName(name));
  await fsp.writeFile(/*turbopackIgnore: true*/ full, data);
  return full;
}

/** Зарегистрировать файл в реестре (идемпотентно по id). */
export function registerFile(input: RegisterInput): FileRow {
  const row: FileRow = {
    id: input.id,
    login: input.login,
    chat_id: input.chat_id || "",
    project_id: input.project_id ?? null,
    direction: input.direction,
    name: sanitizeName(input.name),
    mime: input.mime || guessMime(input.name),
    size: Math.max(0, Math.round(input.size)),
    storage_path: input.storage_path,
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO files (id, login, chat_id, project_id, direction, name, mime, size, storage_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    )
    .run(row.id, row.login, row.chat_id, row.project_id, row.direction, row.name, row.mime, row.size, row.storage_path, row.created_at);
  return row;
}

/** Файлы проекта (загрузки + артефакты), новые сверху. Только владелец. */
export function listFilesForProject(login: string, projectId: string): FileRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM files WHERE login = ? AND project_id = ? ORDER BY created_at DESC"
    )
    .all(login, projectId) as FileRow[];
  return rows;
}

export function getFile(id: string): FileRow | null {
  try {
    const r = getDb().prepare("SELECT * FROM files WHERE id = ?").get(String(id || ""));
    return (r as FileRow) || null;
  } catch {
    return null;
  }
}

/** Файл, доступный данному логину: владелец или админ. Иначе null. */
export function getFileForOwner(id: string, login: string, isAdmin: boolean): FileRow | null {
  const row = getFile(id);
  if (!row) return null;
  if (!isAdmin && row.login !== login) return null;
  return row;
}

/** Принадлежность пути стору (anti-traversal). */
export function isWithinStore(p: string): boolean {
  const root = path.resolve(/*turbopackIgnore: true*/ fileStoreRoot());
  const abs = path.resolve(/*turbopackIgnore: true*/ String(p || ""));
  return abs === root || abs.startsWith(root + path.sep);
}

/** Удалить файл из реестра и со стора. */
export function deleteFile(id: string): boolean {
  const row = getFile(id);
  if (!row) return false;
  getDb().prepare("DELETE FROM files WHERE id = ?").run(id);
  try {
    if (isWithinStore(row.storage_path)) fs.rmSync(/*turbopackIgnore: true*/ row.storage_path, { force: true });
  } catch {
    /* ignore */
  }
  return true;
}

export function fileUrl(id: string): string {
  return `/api/files/${id}`;
}