/**
 * POST /api/files — загрузка файла пользователем (multipart, поле "file").
 * Auth: подписанная кука gtw-auth. Лимит размера — MAX_FILE_SIZE.
 * Кладёт в стор + реестр `files` (direction=in), возвращает {id,name,mime,size,url}.
 * Опционально chat_id (поле формы) — привязка к чату.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminAuth";
import { logEvent } from "@/lib/activity";
import {
  MAX_FILE_SIZE,
  newFileId,
  writeStoreFile,
  registerFile,
  fileUrl,
  sanitizeName,
  guessMime,
} from "@/lib/fileStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ code: "bad_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string" || typeof (file as File).arrayBuffer !== "function") {
    return NextResponse.json({ code: "no_file" }, { status: 400 });
  }
  const f = file as File;
  if (f.size > MAX_FILE_SIZE) {
    return NextResponse.json({ code: "too_large", limit: MAX_FILE_SIZE }, { status: 413 });
  }
  if (f.size === 0) {
    return NextResponse.json({ code: "empty_file" }, { status: 400 });
  }
  const chatId = String(form.get("chat_id") || "").slice(0, 120);
  const id = newFileId();
  const name = sanitizeName(f.name || "file");
  let storagePath: string;
  let size: number;
  try {
    const buf = Buffer.from(await f.arrayBuffer());
    size = buf.length;
    storagePath = await writeStoreFile(session.login, id, name, buf);
  } catch {
    return NextResponse.json({ code: "write_failed" }, { status: 500 });
  }
  const row = registerFile({
    id,
    login: session.login,
    chat_id: chatId,
    direction: "in",
    name,
    mime: f.type || guessMime(name),
    size,
    storage_path: storagePath,
  });
  logEvent("file_upload", session.login, `${row.name} (${row.size} B)`);
  return NextResponse.json({
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    url: fileUrl(row.id),
  });
}