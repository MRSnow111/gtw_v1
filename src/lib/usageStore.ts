/**
 * Учёт токенов и лимиты пользователей.
 * usage_stats — снимок счётчиков агента по чату (пишется из WS-прокси при
 * кадрах session_info и из админ-API при опросе шлюза). Счётчики агента
 * сбрасываются при /new, поэтому сумма — оценка потребления, не billing.
 * user_limits.token_limit: NULL или 0 = без лимита.
 */
import { getDb } from "@/lib/db";

export interface UsageRow {
  chatId: string;
  login: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  turns: number;
  tools: number;
  speed: number | null;
  source: string;
  updatedAt: string;
}

const now = () => new Date().toISOString();

export function upsertUsage(row: UsageRow): void {
  getDb()
    .prepare(
      `INSERT INTO usage_stats (chat_id, login, model, provider, tokens_in, tokens_out, turns, tools, speed, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET
         login = CASE WHEN excluded.login != '' THEN excluded.login ELSE usage_stats.login END,
         model = CASE WHEN excluded.model != '' THEN excluded.model ELSE usage_stats.model END,
         provider = CASE WHEN excluded.provider != '' THEN excluded.provider ELSE usage_stats.provider END,
         tokens_in = excluded.tokens_in,
         tokens_out = excluded.tokens_out,
         turns = excluded.turns,
         tools = excluded.tools,
         speed = excluded.speed,
         source = excluded.source,
         updated_at = excluded.updated_at`
    )
    .run(
      row.chatId, row.login, row.model, row.provider,
      Math.max(0, Math.round(row.tokensIn)), Math.max(0, Math.round(row.tokensOut)),
      Math.max(0, Math.round(row.turns)), Math.max(0, Math.round(row.tools)),
      row.speed, row.source, row.updatedAt || now()
    );
}

interface RawUsage {
  chat_id: string; login: string; model: string; provider: string;
  tokens_in: number; tokens_out: number; turns: number; tools: number;
  speed: number | null; source: string; updated_at: string;
}

function mapRow(r: RawUsage): UsageRow {
  return {
    chatId: r.chat_id, login: r.login, model: r.model, provider: r.provider,
    tokensIn: r.tokens_in, tokensOut: r.tokens_out, turns: r.turns, tools: r.tools,
    speed: r.speed, source: r.source, updatedAt: r.updated_at,
  };
}

export function allUsage(): UsageRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM usage_stats ORDER BY updated_at DESC LIMIT 500")
    .all() as unknown as RawUsage[];
  return rows.map(mapRow);
}

export function usageForChat(chatId: string): UsageRow | null {
  const r = getDb().prepare("SELECT * FROM usage_stats WHERE chat_id = ?").get(chatId) as unknown as RawUsage | undefined;
  return r ? mapRow(r) : null;
}

/** Суммарное потребление логина по всем его чатам (оценка, см. шапку). */
export function totalTokensForLogin(login: string): number {
  const r = getDb()
    .prepare("SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS t FROM usage_stats WHERE login = ?")
    .get(login) as unknown as { t: number };
  return r?.t ?? 0;
}

export function grandTotalTokens(): number {
  const r = getDb()
    .prepare("SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS t FROM usage_stats")
    .get() as unknown as { t: number };
  return r?.t ?? 0;
}

export function getLimit(login: string): number | null {
  const r = getDb().prepare("SELECT token_limit FROM user_limits WHERE login = ?").get(login) as unknown as { token_limit: number | null } | undefined;
  if (!r || r.token_limit === null || r.token_limit <= 0) return null;
  return r.token_limit;
}

export function setLimit(login: string, limit: number | null): void {
  const v = limit === null || limit <= 0 ? null : Math.round(limit);
  getDb()
    .prepare(
      `INSERT INTO user_limits (login, token_limit, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(login) DO UPDATE SET token_limit = excluded.token_limit, updated_at = excluded.updated_at`
    )
    .run(login, v, now());
}

export function allLimits(): Record<string, number | null> {
  const rows = getDb().prepare("SELECT login, token_limit FROM user_limits").all() as unknown as { login: string; token_limit: number | null }[];
  const out: Record<string, number | null> = {};
  for (const r of rows) out[r.login] = r.token_limit && r.token_limit > 0 ? r.token_limit : null;
  return out;
}
