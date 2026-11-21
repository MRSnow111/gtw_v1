/**
 * Файловый менеджер админки: реальное чтение/запись файлов в выделенной
 * директории (GTW_FILES_DIR || <data>/files). Не произвольная ФС: пути
 * резолвятся внутри корня, traversal наружу запрещён. Текстовые файлы ≤ 1 МБ.
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireAdmin, getSession } from "@/lib/adminAuth";
import { dataDir } from "@/lib/db";
import { logEvent } from "@/lib/activity";

const ROOT = path.resolve(process.env.GTW_FILES_DIR || path.join(dataDir(), "files"));
const MAX_SIZE = 1024 * 1024; // 1 МБ

function ensureRoot(): void {
  fs.mkdirSync(ROOT, { recursive: true });
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

// GET /api/admin/files?path=<rel>            — список директории
// GET /api/admin/files?path=<rel>&content=1  — содержимое файла
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  ensureRoot();
  const url = new URL(request.url);
  const rel = url.searchParams.get("path") ?? "";
  const p = safeResolve(rel);
  if (!p) return bad("Недопустимый путь");
  if (!fs.existsSync(p)) return bad("Путь не найден", 404);

  const stat = fs.statSync(p);
  if (url.searchParams.get("content") === "1") {
    if (stat.isDirectory()) return bad("Это директория");
    if (stat.size > MAX_SIZE) return bad("Файл больше 1 МБ — просмотр недоступен", 413);
    const content = fs.readFileSync(p, "utf8");
    return NextResponse.json({
      path: rel,
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  if (!stat.isDirectory()) return bad("Это файл, не директория");
  const entries = fs
    .readdirSync(p, { withFileTypes: true })
    .map((e) => {
      const full = path.join(p, e.name);
      const s = fs.statSync(full);
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
  if (Buffer.byteLength(body.content, "utf8") > MAX_SIZE) return bad("Содержимое больше 1 МБ", 413);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return bad("По этому пути директория");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body.content, "utf8");
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
  if (!p || p === ROOT) return bad("Недопустимый путь");
  if (!fs.existsSync(p)) return bad("Путь не найден", 404);
  fs.rmSync(p, { recursive: true, force: true });
  const actor = (await getSession(request))?.login ?? "?";
  logEvent("file_deleted", actor, rel);
  return NextResponse.json({ ok: true });
}
