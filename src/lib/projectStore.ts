/**
 * Реестр проектов (таблица projects). Проект — папка с общими файлами и
 * контекстом; чаты и файлы ссылаются на него через project_id. slug уникален
 * в рамках login и стабилен (используется как имя каталога в песочнице).
 */
import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export interface ProjectRow {
  id: string;
  login: string;
  name: string;
  slug: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DbProject {
  id: string;
  login: string;
  name: string;
  slug: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

function toRow(r: DbProject): ProjectRow {
  return {
    id: r.id,
    login: r.login,
    name: r.name,
    slug: r.slug,
    archived: !!r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Имя проекта → читаемый slug (латиница, дефисы). Кириллица транслитерируется. */
export function slugify(name: string): string {
  const lower = String(name || "").toLowerCase().trim();
  let out = "";
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += "-";
  }
  out = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return out || "project";
}

export function listProjects(login: string, includeArchived = false): ProjectRow[] {
  const sql = includeArchived
    ? "SELECT * FROM projects WHERE login = ? ORDER BY updated_at DESC"
    : "SELECT * FROM projects WHERE login = ? AND archived = 0 ORDER BY updated_at DESC";
  const rows = getDb().prepare(sql).all(login) as DbProject[];
  return rows.map(toRow);
}

export function getProject(login: string, id: string): ProjectRow | null {
  const r = getDb()
    .prepare("SELECT * FROM projects WHERE login = ? AND id = ?")
    .get(login, id) as DbProject | undefined;
  return r ? toRow(r) : null;
}

/** Уникальный slug в рамках login: base, base-2, base-3, … */
function uniqueSlug(login: string, base: string): string {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM projects WHERE login = ? AND slug = ?");
  let slug = base;
  let n = 2;
  while (exists.get(login, slug)) {
    slug = `${base}-${n}`.slice(0, 56);
    n += 1;
  }
  return slug;
}

export function createProject(login: string, name: string): ProjectRow {
  const clean = String(name || "").trim().slice(0, 80) || "Проект";
  const id = randomUUID();
  const slug = uniqueSlug(login, slugify(clean));
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO projects (id, login, name, slug, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
    .run(id, login, clean, slug, now, now);
  return { id, login, name: clean, slug, archived: false, createdAt: now, updatedAt: now };
}

/** Переименование: slug НЕ меняется (стабильный каталог песочницы). */
export function renameProject(login: string, id: string, name: string): boolean {
  const clean = String(name || "").trim().slice(0, 80);
  if (!clean) return false;
  const res = getDb()
    .prepare("UPDATE projects SET name = ?, updated_at = ? WHERE login = ? AND id = ?")
    .run(clean, new Date().toISOString(), login, id);
  return Number(res.changes) > 0;
}

export function setArchived(login: string, id: string, archived: boolean): boolean {
  const res = getDb()
    .prepare("UPDATE projects SET archived = ?, updated_at = ? WHERE login = ? AND id = ?")
    .run(archived ? 1 : 0, new Date().toISOString(), login, id);
  return Number(res.changes) > 0;
}

/** Удаление проекта: чаты и файлы отвязываются (project_id=NULL), не удаляются. */
export function deleteProject(login: string, id: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM projects WHERE login = ? AND id = ?").run(login, id);
  if (Number(res.changes) > 0) {
    db.prepare("UPDATE chats SET project_id = NULL WHERE login = ? AND project_id = ?").run(login, id);
    db.prepare("UPDATE files SET project_id = NULL WHERE login = ? AND project_id = ?").run(login, id);
    return true;
  }
  return false;
}
