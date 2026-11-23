/**
 * GET /api/files/[id] — отдача файла (stream) с проверкой владельца.
 * DELETE /api/files/[id] — удаление (владелец или админ).
 *
 * Безопасность: доступ только по id из реестра; storage_path проверяется на
 * принадлежность стору (anti-traversal); nosniff; активный контент (html/svg/
 * скрипты) всегда attachment, чтобы не исполняться в origin mimiric.ru.
 * ?download=1 → attachment; иначе inline для image/pdf/text (превью во фронте).
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { getSession } from "@/lib/adminAuth";
import { logEvent } from "@/lib/activity";
import { getFileForOwner, isWithinStore, deleteFile } from "@/lib/fileStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Типы, которые можно отдавать inline (безопасны для превью). */
function inlineSafe(mime: string): boolean {
  const m = String(mime || "").toLowerCase();
  if (m === "image/svg+xml") return false; // svg может нести скрипт
  return m.startsWith("image/") || m === "application/pdf" || m.startsWith("text/");
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = getFileForOwner(id, session.login, session.role === "admin");
  if (!row) {
    return NextResponse.json({ code: "not_found" }, { status: 404 });
  }
  if (!isWithinStore(row.storage_path) || !fs.existsSync(/*turbopackIgnore: true*/ row.storage_path)) {
    return NextResponse.json({ code: "gone" }, { status: 410 });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(/*turbopackIgnore: true*/ row.storage_path);
  } catch {
    return NextResponse.json({ code: "gone" }, { status: 410 });
  }
  const download = request.nextUrl.searchParams.get("download") === "1";
  const disposition = download || !inlineSafe(row.mime) ? "attachment" : "inline";
  const headers = new Headers({
    "Content-Type": row.mime || "application/octet-stream",
    "Content-Length": String(stat.size),
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  const webStream = Readable.toWeb(fs.createReadStream(/*turbopackIgnore: true*/ row.storage_path)) as ReadableStream<Uint8Array>;
  return new NextResponse(webStream, { status: 200, headers });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = getFileForOwner(id, session.login, session.role === "admin");
  if (!row) {
    return NextResponse.json({ code: "not_found" }, { status: 404 });
  }
  deleteFile(id);
  logEvent("file_delete", session.login, row.name);
  return NextResponse.json({ ok: true });
}