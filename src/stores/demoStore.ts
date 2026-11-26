"use client";

import { create } from "zustand";
import type { Artifact, Approval, DemoChat, Turn, UserAttachment } from "@/lib/demoData";
import { seedCommands } from "@/lib/demoData";
import { seedArtifacts, seedChats, seedTurns } from "@/lib/demoSeeds";

/**
 * DEMO store — имитирует данные бэкенда и ход агента (thinking → tools → streaming).
 * Когда появится реальный API/WS, этот стор заменяется обработчиками событий,
 * а форма данных (Turn/Artifact/DemoChat) сохраняется.
 */

const delay = (ms: number, fn: () => void, key: string) => {
  const id = window.setTimeout(() => {
    timers.get(key)?.delete(id);
    fn();
  }, ms);
  if (!timers.has(key)) timers.set(key, new Set());
  timers.get(key)!.add(id);
  return id;
};

const intervals = new Map<string, number>();
const timers = new Map<string, Set<number>>();

function clearTimers(key: string) {
  timers.get(key)?.forEach((id) => window.clearTimeout(id));
  timers.delete(key);
  const iv = intervals.get(key);
  if (iv) window.clearInterval(iv);
  intervals.delete(key);
}

function patchTurn(chatId: string, turnId: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) {
  useDemoStore.setState((s) => ({
    turnsByChat: {
      ...s.turnsByChat,
      [chatId]: (s.turnsByChat[chatId] || []).map((t) =>
        t.id === turnId ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t
      ),
    },
  }));
}

export interface DemoState {
  chats: DemoChat[];
  turnsByChat: Record<string, Turn[]>;
  artifacts: Artifact[];
  loadingChats: Record<string, boolean>;
  commands: typeof seedCommands;
  activeChatId: string | null;
  /** LIVE: статистика сессии по чату (кадр session_info); в demo отсутствует. */
  sessionInfoByChat?: Record<string, import("@/types/events").SessionInfo>;
  requestSessionInfo?: (chatId: string) => void;
  /** LIVE: загрузить список чатов с сервера (per-login); в demo отсутствует. */
  loadChats?: () => Promise<void>;

  setActiveChat: (id: string | null) => void;
  loadTurns: (chatId: string) => void;
  sendMessage: (chatId: string, text: string, attachments?: UserAttachment[], initialModel?: string) => void;
  startChatWithMessage: (text: string, attachments?: UserAttachment[]) => string;
  stop: (chatId: string) => void;
  decide: (chatId: string, turnId: string, approvalId: string, choice: string, comment?: string) => void;
  answerClarify: (chatId: string, turnId: string, clarifyId: string, response: string) => void;
  createChat: (projectId?: string | null) => DemoChat;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  retryArtifact: (id: string) => void;
  removeArtifact: (id: string) => void;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const useDemoStore = create<DemoState>((set, get) => ({
  chats: seedChats,
  turnsByChat: {},
  artifacts: seedArtifacts,
  loadingChats: {},
  commands: seedCommands,
  activeChatId: null,

  setActiveChat: (id) => set({ activeChatId: id }),

  loadTurns: (chatId) => {
    if (get().turnsByChat[chatId] || get().loadingChats[chatId]) return;
    set((s) => ({ loadingChats: { ...s.loadingChats, [chatId]: true } }));
    delay(700, () => {
      set((s) => {
        const { [chatId]: _drop, ...restLoading } = s.loadingChats;
        return {
          loadingChats: restLoading,
          turnsByChat: { ...s.turnsByChat, [chatId]: clone(seedTurns[chatId] || []) },
        };
      });
    }, `load:${chatId}`);
  },

  sendMessage: (chatId, text, attachments) => {
    const userTurn: Turn = {
      id: `tu${Date.now()}`, kind: "user", createdAt: Date.now(),
      text, attachments: attachments?.length ? attachments : undefined, status: "done",
    };
    set((s) => ({
      turnsByChat: { ...s.turnsByChat, [chatId]: [...(s.turnsByChat[chatId] || []), userTurn] },
      chats: s.chats.map((c) =>
        c.id === chatId
          ? { ...c, updatedAt: new Date().toISOString(), title: c.title === "Новый чат" ? text.slice(0, 42) : c.title }
          : c
      ),
    }));
    runAgent(chatId);
  },

  startChatWithMessage: (text, attachments) => {
    const chat = get().createChat();
    chat.title = text.slice(0, 42) || "Новый чат";
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chat.id ? { ...c, title: chat.title } : c)),
      turnsByChat: {
        ...s.turnsByChat,
        [chat.id]: [{
          id: `tu${Date.now()}`, kind: "user", createdAt: Date.now(),
          text, attachments: attachments?.length ? attachments : undefined, status: "done",
        }],
      },
    }));
    runAgent(chat.id);
    return chat.id;
  },

  stop: (chatId) => {
    clearTimers(`agent:${chatId}`);
    const turns = get().turnsByChat[chatId] || [];
    const last = turns[turns.length - 1];
    if (last?.kind === "agent" && last.agentState === "running") {
      patchTurn(chatId, last.id, {
        agentState: "cancelled",
        thinkingMs: last.thinkingMs === null ? 1500 : last.thinkingMs,
        tools: last.tools?.map((tc) =>
          tc.status === "running" ? { ...tc, status: "cancelled" as const } : tc
        ),
      });
    }
  },

  decide: (chatId, turnId, approvalId, choice, comment) => {
    patchTurn(chatId, turnId, (t) => ({
      approval: t.approval
        ? { ...t.approval, state: choice === "deny" ? "denied" : "allowed", comment }
        : t.approval,
    }));
  },

  answerClarify: (chatId, turnId, clarifyId, response) => {
    patchTurn(chatId, turnId, (t) => ({
      clarify: t.clarify ? { ...t.clarify, state: "answered" as const, answer: response } : t.clarify,
    }));
  },

  createChat: (projectId) => {
    const chat: DemoChat = {
      id: `c${Date.now()}`, title: "Новый чат", userId: "u1",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), kind: "chat",
      projectId: projectId ?? null,
    };
    set((s) => ({ chats: [chat, ...s.chats] }));
    return chat;
  },

  renameChat: (id, title) =>
    set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) })),

  deleteChat: (id) => {
    clearTimers(`agent:${id}`);
    set((s) => ({
      chats: s.chats.filter((c) => c.id !== id),
      artifacts: s.artifacts.filter((a) => a.chatId !== id),
    }));
    const { [id]: _drop, ...rest } = get().turnsByChat;
    set({ turnsByChat: rest });
  },

  retryArtifact: (id) =>
    set((s) => ({
      artifacts: s.artifacts.map((a) =>
        a.id === id
          ? { ...a, error: false, content: a.content ?? "// перезагружено из демо-хранилища\n{}" }
          : a
      ),
    })),

  removeArtifact: (id) => set((s) => ({ artifacts: s.artifacts.filter((a) => a.id !== id) })),
}));

/* ─────────────── Ход агента (демо-симуляция) ─────────────── */

const agentReply = `Проверил тесты и лог.

## Что сделано

1. Политика ретраев вынесена в \`retry.ts\` — теперь попытки считаются предсказуемо.
2. Тест \`ApiClient › retries on 5xx\` снова зелёный: **12 passed / 0 failed**.

\`\`\`bash
✓ src/lib/api/client.test.ts (12)  2.1s
\`\`\`

Следующим шагом могу подключить дженирики (\`request<T>\`) — сказать, чтобы продолжал?`;

function runAgent(chatId: string) {
  const key = `agent:${chatId}`;
  clearTimers(key);

  const turnId = `ta${Date.now()}`;
  useDemoStore.setState((s) => ({
    turnsByChat: {
      ...s.turnsByChat,
      [chatId]: [
        ...(s.turnsByChat[chatId] || []),
        { id: turnId, kind: "agent", createdAt: Date.now(), thinkingMs: null, tools: [], answer: "", revealed: 0, agentState: "running" } as Turn,
      ],
    },
  }));

  delay(1400, () => {
    patchTurn(chatId, turnId, (t) => ({
      thinkingMs: 1400,
      tools: [...(t.tools || []), { id: "d1", tool: "terminal", arg: "npm test -- --watchAll=false", status: "running", output: "" }],
    }));
  }, key);

  delay(3200, () => {
    patchTurn(chatId, turnId, (t) => ({
      tools: (t.tools || []).map((tc) =>
        tc.id === "d1"
          ? { ...tc, status: "ok" as const, output: "Test Suites: 6 passed\nTests:       12 passed\nTime:        2.14 s" }
          : tc
      ),
    }));
  }, key);

  delay(3600, () => {
    patchTurn(chatId, turnId, (t) => ({
      tools: [...(t.tools || []), { id: "d2", tool: "fs.read", arg: "src/lib/api/retry.ts", status: "running", output: "" }],
    }));
  }, key);

  delay(4800, () => {
    patchTurn(chatId, turnId, (t) => ({
      tools: (t.tools || []).map((tc) =>
        tc.id === "d2" ? { ...tc, status: "ok" as const, output: "export const MAX_RETRIES = 3;\nexport const BACKOFF_MS = 400;" } : tc
      ),
    }));
  }, key);

  delay(5200, () => {
    // начало стриминга ответа
    const iv = window.setInterval(() => {
      const turns = useDemoStore.getState().turnsByChat[chatId] || [];
      const t = turns.find((x) => x.id === turnId);
      if (!t) { window.clearInterval(iv); intervals.delete(key); return; }
      const next = (t.revealed ?? 0) + 4;
      if (next >= agentReply.length) {
        window.clearInterval(iv);
        intervals.delete(key);
        patchTurn(chatId, turnId, {
          revealed: agentReply.length,
          agentState: "done",
          approval: { id: `ap${Date.now()}`, command: "npm run lint -- --fix", state: "pending" },
          usage: { inTokens: 1240, outTokens: agentReply.length / 4, durationMs: 7400 },
        });
      } else {
        patchTurn(chatId, turnId, { revealed: next });
      }
    }, 26);
    intervals.set(key, iv);
  }, key);
}
