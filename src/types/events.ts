// Протокол GTW-адаптера (plugin/adapter.py) — JSON-кадры поверх WebSocket.
// Браузер подключается к /ws своего origin; Next-прокси (server.js) проверяет
// куку gtw-auth и подставляет GTW_TOKEN в апстрим-соединение.

export type ApprovalChoice = "once" | "session" | "always" | "deny";

export interface ApprovalAction {
  label: string;
  choice: ApprovalChoice;
  style?: string;
}

export interface HistoryItem {
  role: string;
  content: string;
  ts: string;
  message_id: string;
}

/** Статистика сессии агента (кадр session_info). */
export interface SessionInfo {
  chat_id: string;
  user_id?: string;
  user_name?: string;
  model: string;
  provider: string;
  session_key?: string;
  usage: {
    inTokens: number;
    outTokens: number;
    totalTokens: number;
    apiCalls: number;
    costUsd?: number;
  };
  speed: { tokensPerSec: number | null; charsPerSec: number | null; lastTurnMs: number | null };
  /** agent — счётчики агента; estimate — оценка по объёму текста; unknown — нет данных */
  source: "agent" | "estimate" | "unknown";
  tools: { count: number; names: string[] };
  turns: number;
  lastActivity?: string;
}

export interface ModelProvider {
  name: string;
  label?: string;
  models: string[];
}

export type GtwClientFrame =
  | { type: "user_message"; chat_id: string; text: string; message_id?: string; user_id?: string; user_name?: string; attachments?: { fileId: string; name?: string; mime?: string; size?: number }[] }
  | { type: "approval_response"; request_id: string; choice: ApprovalChoice; user_id?: string }
  | { type: "clarify_response"; clarify_id: string; response: string }
  | { type: "stop"; chat_id: string; user_id?: string }
  | { type: "history"; chat_id: string }
  | { type: "session_info"; chat_id: string }
  | { type: "sessions" }
  | { type: "models"; chat_id: string }
  | { type: "set_model"; chat_id: string; model: string };

export type GtwServerFrame =
  | { type: "hello" }
  | { type: "message"; chat_id: string; message_id: string; content: string; metadata?: Record<string, unknown> }
  | { type: "draft"; chat_id: string; draft_id: number; content: string; metadata?: Record<string, unknown> }
  | { type: "message_edit"; chat_id: string; message_id: string; content: string; finalize?: boolean }
  | { type: "typing"; chat_id: string }
  | {
      type: "approval_request";
      chat_id: string;
      request_id: string;
      command: string;
      description?: string;
      text?: string;
      actions: ApprovalAction[];
    }
  | { type: "approval_ack"; request_id: string; choice: ApprovalChoice; resolved: number }
  | {
      type: "clarify_request";
      chat_id: string;
      clarify_id: string;
      question: string;
      choices: string[];
      multi_select?: boolean;
    }
  | { type: "clarify_ack"; clarify_id: string; resolved: boolean }
  | { type: "artifact"; chat_id: string; kind: "image" | "document"; url: string; caption?: string; name?: string; mime?: string; size?: number; fileId?: string }
  | { type: "history"; chat_id: string; items: HistoryItem[] }
  | { type: "session_info"; info: SessionInfo }
  | { type: "sessions"; items: SessionInfo[] }
  | { type: "models"; chat_id: string; current: { model: string; provider: string }; providers: ModelProvider[]; restricted?: boolean }
  | { type: "set_model_ack"; chat_id: string; model: string; ok: boolean }
  | { type: "status"; chat_id: string; status_key?: string; content: string; metadata?: Record<string, unknown> }
  | { type: "quota"; login: string; limit: number | null; used: number }
  | { type: "error"; error: string; limit?: number; used?: number; model?: string; reason?: string };