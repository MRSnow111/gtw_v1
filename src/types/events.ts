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

export type GtwClientFrame =
  | { type: "user_message"; chat_id: string; text: string; message_id?: string; user_id?: string; user_name?: string }
  | { type: "approval_response"; request_id: string; choice: ApprovalChoice; user_id?: string }
  | { type: "clarify_response"; clarify_id: string; response: string }
  | { type: "stop"; chat_id: string; user_id?: string }
  | { type: "history"; chat_id: string };

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
  | { type: "artifact"; chat_id: string; kind: "image" | "document"; url: string; caption?: string }
  | { type: "history"; chat_id: string; items: HistoryItem[] }
  | { type: "error"; error: string };