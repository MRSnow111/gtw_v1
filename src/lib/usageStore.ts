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

/** Суммарное потребление логина по всем его чатам с учётом offset сброса. */
export function totalTokensForLogin(login: string): number {
  return Math.max(0, rawTotalForLogin(login) - usageOffsetForLogin(login));
}

/** «Сырая» сумма токенов по снапшотам usage_stats (без offset) — база для сброса. */
export function rawTotalForLogin(login: string): number {
  const r = getDb()
    .prepare("SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS t FROM usage_stats WHERE login = ?")
    .get(login) as unknown as { t: number };
  return Number(r?.t ?? 0);
}

/** Offset сброса: сколько токенов «списано» при последнем сбросе расхода. */
export function usageOffsetForLogin(login: string): number {
  const r = getDb()
    .prepare("SELECT usage_offset FROM user_limits WHERE login = ?")
    .get(login) as unknown as { usage_offset: number };
  return Number(r?.usage_offset ?? 0);
}

/**
 * Сброс расхода токенов логина: used = SUM(tokens) - usage_offset обнуляется
 * установкой offset = текущая сумма. Снапшоты usage_stats не трогаем — они
 * кумулятивные и перезатираются следующим session_info; offset делает сброс
 * устойчивым. Лимит (token_limit) и конфиг авто-сброса сохраняются.
 */
export function resetUsage(login: string): { used: number; offset: number } {
  const db = getDb();
  const total = rawTotalForLogin(login);
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT login FROM user_limits WHERE login = ?").get(login);
  if (existing) {
    db.prepare(
      "UPDATE user_limits SET usage_offset = ?, last_reset_at = ?, updated_at = ? WHERE login = ?",
    ).run(total, now, now, login);
  } else {
    db.prepare(
      "INSERT INTO user_limits (login, token_limit, usage_offset, last_reset_at, updated_at) VALUES (?, NULL, ?, ?, ?)",
    ).run(login, total, now, now);
  }
  return { used: 0, offset: total };
}

export type ResetMode = "off" | "daily" | "weekly" | "monthly";
export interface ResetConfig {
  mode: ResetMode;
  hour: number; // 0-23, время сервера (UTC)
  day: number; // weekly: 1-7 (Пн-Вс), monthly: 1-28
  nextResetAt: string | null;
  lastResetAt: string | null;
}

const RESET_MODES: ResetMode[] = ["off", "daily", "weekly", "monthly"];

export function getResetConfig(login: string): ResetConfig {
  const r = getDb()
    .prepare(
      "SELECT reset_mode, reset_hour, reset_day, next_reset_at, last_reset_at FROM user_limits WHERE login = ?",
    )
    .get(login) as unknown as
    | { reset_mode: string; reset_hour: number; reset_day: number; next_reset_at: string | null; last_reset_at: string | null }
    | undefined;
  const mode = RESET_MODES.includes(r?.reset_mode as ResetMode) ? (r!.reset_mode as ResetMode) : "off";
  return {
    mode,
    hour: Number(r?.reset_hour ?? 0),
    day: Number(r?.reset_day ?? 1),
    nextResetAt: r?.next_reset_at ?? null,
    lastResetAt: r?.last_reset_at ?? null,
  };
}

/**
 * Ближайший момент авто-сброса строго после from (время сервера, UTC).
 * daily — каждый день в hour:00; weekly — день недели day (1=Пн..7=Вс) в hour:00;
 * monthly — число day (1-28) в hour:00. null для mode='off'.
 */
export function computeNextReset(mode: ResetMode, hour: number, day: number, from: Date): Date | null {
  if (mode === "off") return null;
  const h = Math.min(23, Math.max(0, Math.floor(hour)));
  const at = (d: Date) => {
    const x = new Date(d);
    x.setUTCHours(h, 0, 0, 0);
    return x;
  };
  if (mode === "daily") {
    let cand = at(from);
    if (cand <= from) cand = new Date(cand.getTime() + 86400000);
    return cand;
  }
  if (mode === "weekly") {
    const target = (Math.min(7, Math.max(1, Math.floor(day))) - 1) % 7; // 0=Пн..6=Вс
    const jsTarget = (target + 1) % 7; // JS: 0=Вс..6=Сб
    let cand = at(from);
    for (let i = 0; i < 8; i++) {
      if (cand.getUTCDay() === jsTarget && cand > from) return cand;
      cand = new Date(cand.getTime() + 86400000);
    }
    return cand;
  }
  const dom = Math.min(28, Math.max(1, Math.floor(day)));
  const cand = at(from);
  cand.setUTCDate(dom);
  if (cand <= from) {
    cand.setUTCMonth(cand.getUTCMonth() + 1);
    cand.setUTCDate(dom);
  }
  return cand;
}

/** Записать конфиг авто-сброса и вычислить next_reset_at. Сохраняет token_limit/offset. */
export function setResetConfig(login: string, mode: ResetMode, hour: number, day: number): ResetConfig {
  const db = getDb();
  const now = new Date();
  const next = computeNextReset(mode, hour, day, now);
  const nextIso = next ? next.toISOString() : null;
  const nowIso = now.toISOString();
  const existing = db.prepare("SELECT login FROM user_limits WHERE login = ?").get(login);
  if (existing) {
    db.prepare(
      "UPDATE user_limits SET reset_mode = ?, reset_hour = ?, reset_day = ?, next_reset_at = ?, updated_at = ? WHERE login = ?",
    ).run(mode, Math.floor(hour), Math.floor(day), nextIso, nowIso, login);
  } else {
    db.prepare(
      "INSERT INTO user_limits (login, token_limit, reset_mode, reset_hour, reset_day, next_reset_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?)",
    ).run(login, mode, Math.floor(hour), Math.floor(day), nextIso, nowIso);
  }
  return getResetConfig(login);
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
