import type { DatabaseSync } from "node:sqlite";

export interface UsageRowRaw {
  chat_id: string;
  login: string;
  model: string;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  turns: number;
  tools: number;
  speed: number | null;
  source: string;
  updated_at: string;
}

export function openGtwDb(dataDir: string): DatabaseSync;
export function upsertUsageRow(db: DatabaseSync, r: UsageRowRaw): void;
export function rawTotalForLogin(db: DatabaseSync, login: string): number;
export function usageOffsetForLogin(db: DatabaseSync, login: string): number;
export function usedForLogin(db: DatabaseSync, login: string): number;
export function resetUsageOffset(db: DatabaseSync, login: string): number;
export function computeNextResetMs(
  mode: string,
  hour: number,
  day: number,
  fromMs: number
): number | null;
export function limitForLogin(db: DatabaseSync, login: string): number | null;
export function modelAllowedCore(allow: string[] | null, target: string): boolean;
export function grandUsedTokens(db: DatabaseSync): number;