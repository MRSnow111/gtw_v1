/**
 * Файловый менеджер админки: реальное чтение/запись файлов в выделенной
 * директории (GTW_FILES_DIR || <data>/files). Не произвольная ФС: пути
 * резолвятся внутри корня, traversal наружу запрещён. Текстовые файлы ≤ 1 МБ.
 *
 * turbopackIgnore: корень берётся из env (GTW_FILES_DIR), поэтому Turbopack не
 * может статически ограничить путь и трассирует весь проект. Доступ к ФС здесь
 * намеренный и ограничен safeResolve — отключаем трассировку для этих вызовов.
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireAdmin, getSession } from "@/lib/adminAuth";
import { dataDir } from "@/lib/db";
import { logEvent } from "@/lib/activity";

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.GTW_FILES_DIR || path.join(dataDir(), "files"));
const MAX_SIZE = 1024 * 1024; // 1 МБ

function ensureRoot(): void {
  fs.mkdirSync(/*turbopackIgnore: true*/ ROOT, { recursive: true });
}

/** Резолвит относительный путь внутри ROOT; null — попытка выхода наружу. */
function safeResolve(rel: string): string | null {
  if (rel.includes("\0")) return null;
  const p = path.resolve(ROOT, rel || ".");
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) return null;
  return p;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ code: "bad_request", message }, { status });
}

/** S8: секреты/ключи не читаем, не пишем и не удаляем через менеджер,
 *  даже внутри выделенного корня (GTW_FILES_DIR может указывать куда угодно). */
function sensitiveName(rel: string): boolean {
  const base = path.basename(rel || "").toLowerCase();
  if (base.startsWith(".env")) return true;
  return /\.(env|pem|key|p12|pfx|jks|keystore)$/.test(base);
}

/** S8: whitelist расширений для создания/сохранения (текстовые форматы). */
const EDITABLE_EXT = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "html", "htm",
  "css", "log", "xml", "yaml", "yml",
]);
function editablePath(rel: string): boolean {
  const ext = path.extname(rel || "").replace(/^\./, "").toLowerCase();
  return EDITABLE_EXT.has(ext);
}

/** Есть ли внутри директории чувствительные файлы (запрет рекурсивного удаления). */
function dirHasSensitive(dir: string): boolean {
  for (const e of fs.readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })) {
    if (sensitiveName(e.name)) return true;
    if (e.isDirectory() && dirHasSensitive(path.join(dir, e.name))) return true;
  }
  return false;
}

// GET /api/admin/files?path=<rel>            — список директории
// GET /api/admin/files?path=<rel>&content=1  — содержимое файла
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  ensureRoot();
  const url = new URL(request.url);
  const rel = url.searchParams.get("path") ?? "";
  const p = safeResolve(rel);
  if (!p || sensitiveName(rel)) return bad("Недопустимый путь");
  if (!fs.existsSync(/*turbopackIgnore: true*/ p)) return bad("Путь не найден", 404);

  const stat = fs.statSync(/*turbopackIgnore: true*/ p);
  if (url.searchParams.get("content") === "1") {
    if (stat.isDirectory()) return bad("Это директория");
    if (stat.size > MAX_SIZE) return bad("Файл больше 1 МБ — просмотр недоступен", 413);
    const content = fs.readFileSync(/*turbopackIgnore: true*/ p, "utf8");
    return NextResponse.json({
      path: rel,
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  if (!stat.isDirectory()) return bad("Это файл, не директория");
  const entries = fs
    .readdirSync(/*turbopackIgnore: true*/ p, { withFileTypes: true })
    .map((e) => {
      const full = path.join(/*turbopackIgnore: true*/ p, e.name);
      const s = fs.statSync(/*turbopackIgnore: true*/ full);
      const isDir = e.isDirectory();
      return {
        name: e.name,
        isDir,
        type: isDir ? "directory" : path.extname(e.name).replace(/^\./, "") || "file",
        size: isDir ? 0 : s.size,
        modifiedAt: s.mtime.toISOString(),
      };
    })
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  return NextResponse.json({ path: rel, entries });
}

// POST /api/admin/files — создать/сохранить: {path, content}
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => null);
  if (typeof body?.path !== "string" || typeof body?.content !== "string") {
    return bad("Нужны path и content");
  }
  const p = safeResolve(body.path);
  if (!p || p === ROOT) return bad("Недопустимый путь");
  if (sensitiveName(body.path) || !editablePath(body.path)) {
    return bad("Тип файла не разрешён для редактирования", 403);
  }
  if (Buffer.byteLength(body.content, "utf8") > MAX_SIZE) return bad("Содержимое больше 1 МБ", 413);
  if (fs.existsSync(/*turbopackIgnore: true*/ p) && fs.statSync(/*turbopackIgnore: true*/ p).isDirectory()) return bad("По этому пути директория");
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ p, body.content, "utf8");
  const actor = (await getSession(request))?.login ?? "?";
  logEvent("file_saved", actor, body.path);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/files?path=<rel> — файл или директория (рекурсивно)
export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  const p = safeResolve(rel);
  if (!p || p === ROOT || sensitiveName(rel)) return bad("Недопустимый путь");
  if (!fs.existsSync(/*turbopackIgnore: true*/ p)) return bad("Путь не найден", 404);
  if (fs.statSync(/*turbopackIgnore: true*/ p).isDirectory() && dirHasSensitive(p)) {
    return bad("В директории есть защищённые файлы — удаление запрещено", 403);
  }
  fs.rmSync(/*turbopackIgnore: true*/ p, { recursive: true, force: true });
  const actor = (await getSession(request))?.login ?? "?";
  logEvent("file_deleted", actor, rel);
  return NextResponse.json({ ok: true });
}
