/**
 * Реестр чатов per-login (SQLite). Список чатов хранится на сервере и
 * привязан к логину из подписанной куки — это закрывает две проблемы:
 *  - изоляция: при смене аккаунта в том же браузере видны только его чаты;
 *  - синхронизация: один логин на разных устройствах видит один список.
 * Сами ходы (history) по-прежнему отдаёт шлюз per chat_id; здесь только
 * метаданные списка (id/заголовок/время/проект).
 */
import { getDb } from "@/lib/db";

export interface ChatRow {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listChats(login: string): ChatRow[] {
  const rows = getDb()
    .prepare(
      "SELECT chat_id, title, project_id, created_at, updated_at FROM chats WHERE login = ? ORDER BY updated_at DESC"
    )
    .all(login) as Array<{
    chat_id: string;
    title: string;
    project_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((r) => ({
    id: r.chat_id,
    title: r.title,
    projectId: r.project_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Создать чат или обновить заголовок/время (created_at не трогаем).
 * projectId: undefined — сохранить текущую привязку; null — отвязать; строка — привязать.
 */
export function upsertChat(
  login: string,
  chatId: string,
  title: string,
  projectId?: string | null,
  updatedAt?: string
): void {
  const now = updatedAt || new Date().toISOString();
  const keepProject = projectId === undefined;
  getDb()
    .prepare(
      `INSERT INTO chats (login, chat_id, title, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(login, chat_id) DO UPDATE SET
         title = excluded.title,
         project_id = CASE WHEN ? THEN chats.project_id ELSE excluded.project_id END,
         updated_at = excluded.updated_at`
    )
    .run(login, chatId, title, projectId ?? null, now, now, keepProject ? 1 : 0);
}

/** Переместить чат в проект (projectId=null — без проекта). */
export function moveChat(login: string, chatId: string, projectId: string | null): boolean {
  const res = getDb()
    .prepare("UPDATE chats SET project_id = ?, updated_at = ? WHERE login = ? AND chat_id = ?")
    .run(projectId, new Date().toISOString(), login, chatId);
  return Number(res.changes) > 0;
}

export function deleteChat(login: string, chatId: string): void {
  getDb().prepare("DELETE FROM chats WHERE login = ? AND chat_id = ?").run(login, chatId);
}
