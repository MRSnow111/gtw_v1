/**
 * Учёт токенов и лимиты пользователей.
 * usage_stats — снимок счётчиков агента по чату (пишется из WS-прокси при
 * кадрах session_info и из админ-API при опросе шлюза). Счётчики агента
 * сбрасываются при /new, поэтому сумма — оценка потребления, не billing.
 * user_limits.token_limit: NULL или 0 = без лимита.
 */
import { getDb } from "@/lib/db";
import {
  upsertUsageRow,
  rawTotalForLogin as rawTotalShared,
  usageOffsetForLogin as offsetShared,
  usedForLogin,
  resetUsageOffset,
  computeNextResetMs,
  limitForLogin,
  grandUsedTokens as grandUsedShared,
} from "@/lib/gtwDb.mjs";

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
  upsertUsageRow(getDb(), {
    chat_id: row.chatId, login: row.login, model: row.model, provider: row.provider,
    tokens_in: row.tokensIn, tokens_out: row.tokensOut, turns: row.turns, tools: row.tools,
    speed: row.speed, source: row.source, updated_at: row.updatedAt || now(),
  });
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
  return usedForLogin(getDb(), login);
}

/** «Сырая» сумма токенов по снапшотам usage_stats (без offset) — база для сброса. */
export function rawTotalForLogin(login: string): number {
  return rawTotalShared(getDb(), login);
}

/** Offset сброса: сколько токенов «списано» при последнем сбросе расхода. */
export function usageOffsetForLogin(login: string): number {
  return offsetShared(getDb(), login);
}

/**
 * Сброс расхода токенов логина: used = SUM(tokens) - usage_offset обнуляется
 * установкой offset = текущая сумма. Снапшоты usage_stats не трогаем — они
 * кумулятивные и перезатираются следующим session_info; offset делает сброс
 * устойчивым. Лимит (token_limit) и конфиг авто-сброса сохраняются.
 */
export function resetUsage(login: string): { used: number; offset: number } {
  const offset = resetUsageOffset(getDb(), login);
  return { used: 0, offset };
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
 * Ближайший момент авто-сброса строго после from (UTC). Ядро — в gtwDb.cjs
 * (единая копия с server.js); здесь только Date-обёртка.
 * daily — каждый день в resetHour:00; weekly — resetDay 1=Пн..7=Вс; monthly — resetDay 1-28.
 */
export function computeNextReset(mode: ResetMode, hour: number, day: number, from: Date): Date | null {
  const ms = computeNextResetMs(mode, hour, day, from.getTime());
  return ms === null ? null : new Date(ms);
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

/** Суммарный расход всех логинов с учётом offset каждого (totals админки). */
export function grandUsedTokens(): number {
  return grandUsedShared(getDb());
}

export function getLimit(login: string): number | null {
  return limitForLogin(getDb(), login);
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
