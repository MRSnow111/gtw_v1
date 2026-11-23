/**
 * Реестр чатов per-login (SQLite). Список чатов хранится на сервере и
 * привязан к логину из подписанной куки — это закрывает две проблемы:
 *  - изоляция: при смене аккаунта в том же браузере видны только его чаты;
 *  - синхронизация: один логин на разных устройствах видит один список.
 * Сами ходы (history) по-прежнему отдаёт шлюз per chat_id; здесь только
 * метаданные списка (id/заголовок/время).
 */
import { getDb } from "@/lib/db";

export interface ChatRow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export function listChats(login: string): ChatRow[] {
  const rows = getDb()
    .prepare(
      "SELECT chat_id, title, created_at, updated_at FROM chats WHERE login = ? ORDER BY updated_at DESC"
    )
    .all(login) as Array<{ chat_id: string; title: string; created_at: string; updated_at: string }>;
  return rows.map((r) => ({
    id: r.chat_id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Создать чат или обновить заголовок/время (created_at не трогаем). */
export function upsertChat(login: string, chatId: string, title: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO chats (login, chat_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(login, chat_id) DO UPDATE SET
         title = excluded.title,
         updated_at = excluded.updated_at`
    )
    .run(login, chatId, title, now, now);
}

export function deleteChat(login: string, chatId: string): void {
  getDb().prepare("DELETE FROM chats WHERE login = ? AND chat_id = ?").run(login, chatId);
}