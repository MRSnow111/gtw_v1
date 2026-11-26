"use client";

import type { Chat } from "@/types/chat";

/* ─────────────── Types ─────────────── */

export type ToolStatus = "running" | "ok" | "error" | "cancelled";
export type ApprovalState = "pending" | "allowed" | "denied" | "expired";

export interface ToolCall {
  id: string;
  tool: string;
  arg: string;
  argsFull?: string;
  status: ToolStatus;
  output: string;
}

export interface Approval {
  id: string;
  command: string;
  state: ApprovalState;
  comment?: string;
  description?: string;
  actions?: { label: string; choice: string; style?: string }[];
}

export interface Clarify {
  id: string;
  question: string;
  choices: string[];
  multiSelect?: boolean;
  state: "pending" | "answered";
  answer?: string;
}

export interface UserAttachment {
  key?: string;
  name: string;
  size: string;
  status: "uploading" | "ready" | "failed";
  progress?: number;
  fileId?: string;
  url?: string;
  mime?: string;
  sizeBytes?: number;
}

export interface Turn {
  id: string;
  kind: "user" | "agent";
  createdAt: number;

  // user turn
  text?: string;
  attachments?: UserAttachment[];
  status?: "pending" | "done" | "error" | "cancelled";

  // agent turn
  messageId?: string; // id сообщения шлюза (для message_edit)
  thinkingMs?: number | null; // null = ещё думает
  tools?: ToolCall[];
  answer?: string;
  revealed?: number; // сколько символов ответа показано (стриминг)
  approval?: Approval;
  clarify?: Clarify;
  usage?: { inTokens: number; outTokens: number; durationMs: number };
  thinkingText?: string; // рассуждения/commentary агента (кадры status)
  statusNotes?: Record<string, string>; // служебные статусы по status_key (последнее значение)
  /** D6: ход закрыт таймером тишины и не принёс ни ответа, ни инструментов. */
  emptySilence?: boolean;
  agentState?: "running" | "done" | "cancelled" | "error";
}

export type DemoChat = Chat & { kind: "chat" | "terminal" | "data" };

export interface Project {
  id: string;
  name: string;
  slug: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ArtifactKind = "code" | "image" | "pdf" | "office" | "markdown" | "other";

export interface Artifact {
  id: string;
  chatId: string;
  name: string;
  kind: ArtifactKind;
  size: string;
  updatedAt: string;
  content?: string;
  lang?: string;
  url?: string;
  error?: boolean;
  fileId?: string;
  mime?: string;
  sizeBytes?: number;
}

export interface Command {
  name: string;
  description: string;
}

export const DEMO_USER = { name: "MRSnow", role: "владелец" };

export const seedCommands: Command[] = [
  { name: "/stop", description: "Остановить текущую генерацию" },
  { name: "/new", description: "Создать новый чат" },
  { name: "/clear", description: "Очистить контекст чата" },
  { name: "/model", description: "Показать текущую модель агента" },
  { name: "/help", description: "Список доступных команд" },
];

/* ─────────────── Helpers ─────────────── */

const HOUR = 60 * 60_000;

export function groupChats(chats: DemoChat[]): { label: string; chats: DemoChat[] }[] {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();
  const weekStart = dayStart - 6 * 24 * HOUR;

  const sorted = [...chats].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const groups: { label: string; chats: DemoChat[] }[] = [
    { label: "Сегодня", chats: [] },
    { label: "На этой неделе", chats: [] },
    { label: "Ранее", chats: [] },
  ];
  for (const c of sorted) {
    const t = +new Date(c.updatedAt);
    if (t >= dayStart) groups[0].chats.push(c);
    else if (t >= weekStart) groups[1].chats.push(c);
    else groups[2].chats.push(c);
  }
  return groups.filter((g) => g.chats.length > 0);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}