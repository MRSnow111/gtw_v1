"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type { Artifact, DemoChat, ToolCall, Turn } from "@/lib/demoData";
import { seedCommands, formatSize } from "@/lib/demoData";
import { detectKind } from "@/lib/fileKind";
import type { DemoState } from "@/stores/demoStore";
import { gtwSocket } from "@/lib/gtwSocket";
import type { ApprovalChoice, GtwServerFrame } from "@/types/events";
import { useAuthStore } from "@/stores/authStore";

/**
 * LIVE store — тот же интерфейс, что у demoStore, но ходы строятся из реальных
 * WS-кадров gtw-адаптера (typing/draft/message/message_edit/approval/clarify/…).
 * Список чатов хранится на СЕРВЕРЕ per-login (/api/chats) и грузится при входе —
 * изоляция между аккаунтами и синхронизация между устройствами. История ходов
 * запрашивается у шлюза (history).
 */

const SILENCE_MS = 2500; // тишина после последнего кадра => ход завершён
const silenceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function patchTurn(chatId: string, turnId: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) {
  useLiveStore.setState((s) => ({
    turnsByChat: {
      ...s.turnsByChat,
      [chatId]: (s.turnsByChat[chatId] || []).map((t) =>
        t.id === turnId ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t
      ),
    },
  }));
}

function lastAgentTurn(chatId: string): Turn | undefined {
  const turns = useLiveStore.getState().turnsByChat[chatId] || [];
  const last = turns[turns.length - 1];
  return last?.kind === "agent" ? last : undefined;
}

/** Гарантирует running-ход агента в конце ленты (создаёт, если нужно). */
function ensureAgentTurn(chatId: string): Turn {
  const last = lastAgentTurn(chatId);
  if (last && last.agentState === "running") return last;
  const turn: Turn = {
    id: uid("ta"), kind: "agent", createdAt: Date.now(),
    thinkingMs: null, tools: [], answer: "", revealed: 0, agentState: "running",
  };
  useLiveStore.setState((s) => ({
    turnsByChat: { ...s.turnsByChat, [chatId]: [...(s.turnsByChat[chatId] || []), turn] },
  }));
  return turn;
}

function clearSilence(chatId: string) {
  const t = silenceTimers.get(chatId);
  if (t) clearTimeout(t);
  silenceTimers.delete(chatId);
}

/** Ход считается завершённым, если шлюз замолчал и нет ожидания пользователя. */
function armSilence(chatId: string) {
  clearSilence(chatId);
  silenceTimers.set(chatId, setTimeout(() => {
    silenceTimers.delete(chatId);
    const t = lastAgentTurn(chatId);
    if (!t || t.agentState !== "running") return;
    if (t.approval?.state === "pending" || t.clarify?.state === "pending") return;
    patchTurn(chatId, t.id, {
      agentState: "done",
      thinkingMs: t.thinkingMs ?? Math.max(0, Date.now() - t.createdAt),
    });
    // обновляем статистику сессии (и учёт токенов в прокси) после хода
    gtwSocket.send({ type: "session_info", chat_id: chatId });
  }, SILENCE_MS));
}

function finishThinking(chatId: string, t: Turn) {
  if (t.thinkingMs === null || t.thinkingMs === undefined) {
    patchTurn(chatId, t.id, { thinkingMs: Math.max(0, Date.now() - t.createdAt) });
  }
}

function upsertTool(tools: ToolCall[], tc: ToolCall): ToolCall[] {
  const i = tools.findIndex((x) => x.id === tc.id);
  if (i === -1) return [...tools, tc];
  const next = [...tools];
  next[i] = { ...next[i], ...tc };
  return next;
}

function userId(): string {
  return useAuthStore.getState().user?.name || "gtw-web";
}

/** Серверная синхронизация списка чатов (per-login). Ошибки не блокируют UI. */
function syncChat(chat: DemoChat) {
  try {
    fetch("/api/chats", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat.id, title: chat.title }),
    }).catch(() => {});
  } catch {}
}
function unsyncChat(id: string) {
  try {
    fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  } catch {}
}

/* ─────────────── Маршрутизация кадров шлюза ─────────────── */

function onFrame(frame: GtwServerFrame) {
  switch (frame.type) {
    case "hello":
      break;

    case "typing": {
      ensureAgentTurn(frame.chat_id);
      armSilence(frame.chat_id);
      break;
    }

    case "draft": {
      const t = ensureAgentTurn(frame.chat_id);
      finishThinking(frame.chat_id, t);
      patchTurn(frame.chat_id, t.id, { answer: frame.content, revealed: frame.content.length });
      armSilence(frame.chat_id);
      break;
    }

    case "message": {
      const chatId = frame.chat_id;
      const meta = frame.metadata || {};
      // tool-progress: формат metadata уточняется; защищаемся от отсутствия поля
      if (typeof meta.tool === "string") {
        const t = ensureAgentTurn(chatId);
        finishThinking(chatId, t);
        const status = meta.status === "running" || meta.status === "error" || meta.status === "cancelled"
          ? (meta.status as ToolCall["status"]) : "ok";
        const tc: ToolCall = {
          id: String(meta.tool_id || frame.message_id),
          tool: meta.tool,
          arg: String(meta.arg ?? meta.args ?? ""),
          status,
          output: frame.content,
        };
        patchTurn(chatId, t.id, (prev) => ({ tools: upsertTool(prev.tools || [], tc) }));
        armSilence(chatId);
        break;
      }
      const turns = useLiveStore.getState().turnsByChat[chatId] || [];
      const existing = turns.find((x) => x.kind === "agent" && x.messageId === frame.message_id);
      const t = existing || ensureAgentTurn(chatId);
      finishThinking(chatId, t);
      patchTurn(chatId, t.id, {
        messageId: frame.message_id,
        answer: frame.content,
        revealed: frame.content.length,
      });
      armSilence(chatId);
      break;
    }

    case "message_edit": {
      const chatId = frame.chat_id;
      const turns = useLiveStore.getState().turnsByChat[chatId] || [];
      let t = turns.find((x) => x.kind === "agent" && x.messageId === frame.message_id);
      if (!t) {
        t = ensureAgentTurn(chatId);
        patchTurn(chatId, t.id, { messageId: frame.message_id });
      }
      finishThinking(chatId, t);
      patchTurn(chatId, t.id, { answer: frame.content, revealed: frame.content.length });
      if (frame.finalize) {
        clearSilence(chatId);
        patchTurn(chatId, t.id, {
          agentState: "done",
          thinkingMs: t.thinkingMs ?? Math.max(0, Date.now() - t.createdAt),
        });
        gtwSocket.send({ type: "session_info", chat_id: chatId });
      } else {
        armSilence(chatId);
      }
      break;
    }

    case "approval_request": {
      const t = ensureAgentTurn(frame.chat_id);
      clearSilence(frame.chat_id); // ждём пользователя, таймер тишины не нужен
      patchTurn(frame.chat_id, t.id, {
        approval: {
          id: frame.request_id,
          command: frame.command || frame.text || "",
          description: frame.description,
          state: "pending",
          actions: frame.actions,
        },
      });
      break;
    }

    case "approval_ack": {
      const entries: [string, Turn[]][] = Object.entries(useLiveStore.getState().turnsByChat);
      for (const [chatId, turns] of entries) {
        const t = turns.find((x) => x.approval?.id === frame.request_id);
        if (!t || !t.approval) continue;
        if (frame.resolved > 0) {
          patchTurn(chatId, t.id, {
            approval: { ...t.approval, state: frame.choice === "deny" ? "denied" : "allowed" },
          });
          armSilence(chatId);
        } else {
          patchTurn(chatId, t.id, { approval: { ...t.approval, state: "pending" } });
          toast.error("Шлюз не принял решение — попробуйте ещё раз");
        }
        break;
      }
      break;
    }

    case "clarify_request": {
      const t = ensureAgentTurn(frame.chat_id);
      clearSilence(frame.chat_id);
      patchTurn(frame.chat_id, t.id, {
        clarify: {
          id: frame.clarify_id,
          question: frame.question,
          choices: frame.choices || [],
          multiSelect: frame.multi_select,
          state: "pending",
        },
      });
      break;
    }

    case "clarify_ack": {
      const entries: [string, Turn[]][] = Object.entries(useLiveStore.getState().turnsByChat);
      for (const [chatId, turns] of entries) {
        const t = turns.find((x) => x.clarify?.id === frame.clarify_id);
        if (!t || !t.clarify) continue;
        if (frame.resolved) {
          patchTurn(chatId, t.id, { clarify: { ...t.clarify, state: "answered" } });
          armSilence(chatId);
        } else {
          patchTurn(chatId, t.id, { clarify: { ...t.clarify, state: "pending" } });
          toast.error("Шлюз не принял ответ — попробуйте ещё раз");
        }
        break;
      }
      break;
    }

    case "artifact": {
      const mime = frame.mime || "";
      const name = frame.name || frame.caption || frame.url.split("/").pop() || "артефакт";
      const sizeBytes = typeof frame.size === "number" ? frame.size : 0;
      const det = detectKind(name, mime);
      const kind = frame.kind === "image" ? "image" : det.kind;
      const art: Artifact = {
        id: uid("ar"),
        chatId: frame.chat_id,
        name,
        kind,
        lang: det.lang || undefined,
        size: sizeBytes ? formatSize(sizeBytes) : "",
        updatedAt: new Date().toISOString(),
        url: frame.url,
        fileId: frame.fileId,
        mime,
        sizeBytes,
      };
      useLiveStore.setState((s) => ({ artifacts: [art, ...s.artifacts] }));
      break;
    }

    case "history": {
      const turns: Turn[] = frame.items.map((it, i) => {
        const ts = Date.parse(it.ts) || Date.now();
        if (it.role === "user") {
          return { id: it.message_id || `hu${i}`, kind: "user" as const, createdAt: ts, text: it.content, status: "done" as const };
        }
        return {
          id: it.message_id || `ha${i}`, kind: "agent" as const, createdAt: ts,
          messageId: it.message_id, answer: it.content, revealed: it.content.length,
          agentState: "done" as const, thinkingMs: 0,
        };
      });
      useLiveStore.setState((s) => {
        const { [frame.chat_id]: _drop, ...restLoading } = s.loadingChats;
        return {
          loadingChats: restLoading,
          turnsByChat: { ...s.turnsByChat, [frame.chat_id]: turns },
        };
      });
      break;
    }

    case "session_info": {
      useLiveStore.setState((s) => ({
        sessionInfoByChat: { ...(s.sessionInfoByChat || {}), [frame.info.chat_id]: frame.info },
      }));
      break;
    }

    case "status": {
      const chatId = frame.chat_id;
      const t = ensureAgentTurn(chatId);
      const meta = frame.metadata || {};
      const content = String(frame.content || "").trim();
      if (!content) break;
      if (typeof meta.tool === "string") {
        // tool-progress со структурированным именем инструмента
        finishThinking(chatId, t);
        const tc: ToolCall = {
          id: String(meta.tool_id || frame.status_key || frame.content.slice(0, 24)),
          tool: meta.tool,
          arg: String(meta.arg ?? meta.args ?? ""),
          status: meta.status === "error" ? "error" : meta.status === "running" ? "running" : "ok",
          output: content,
        };
        patchTurn(chatId, t.id, (prev) => ({ tools: upsertTool(prev.tools || [], tc) }));
      } else {
        // рассуждения/commentary и служебные статусы — в сворачиваемый блок,
        // не в тело ответа; один status_key обновляет свою строку, не плодит дубли
        const key = String(frame.status_key || "");
        const kind = String(meta.kind || "");
        const isReasoning = kind === "thinking" || kind === "commentary" || kind === "reasoning"
          || key.includes("commentary") || key.includes("thinking");
        patchTurn(chatId, t.id, (prev) => {
          if (isReasoning || !key) {
            const prevText = prev.thinkingText || "";
            // повторный кадр того же рассуждения (edit) не дублируем
            if (prevText.endsWith(content)) return {};
            return { thinkingText: prevText ? `${prevText}\n${content}` : content };
          }
          return { statusNotes: { ...(prev.statusNotes || {}), [key]: content } };
        });
      }
      armSilence(chatId);
      break;
    }

    case "models":
    case "sessions":
    case "set_model_ack":
      // админ-кадры обрабатываются в админке через REST; в чате игнорируем
      break;

    case "error": {
      if (frame.error === "quota_exceeded") {
        const used = typeof frame.used === "number" ? frame.used.toLocaleString("ru-RU") : "?";
        const limit = typeof frame.limit === "number" ? frame.limit.toLocaleString("ru-RU") : "?";
        toast.error(`Лимит токенов исчерпан: ${used} / ${limit}. Обратитесь к администратору.`);
        const entries: [string, Turn[]][] = Object.entries(useLiveStore.getState().turnsByChat);
        for (const [chatId, turns] of entries) {
          const t = turns[turns.length - 1];
          if (t?.kind === "agent" && t.agentState === "running") {
            patchTurn(chatId, t.id, { agentState: "error" });
            break;
          }
        }
      } else if (frame.error === "forbidden") {
        toast.error("Недостаточно прав для этого действия");
      } else if (frame.error === "model_forbidden") {
        const m = frame.model ? ` «${frame.model}»` : "";
        toast.error(`Модель${m} недоступна. Выберите разрешённую в пикере моделей.`);
        const entries: [string, Turn[]][] = Object.entries(useLiveStore.getState().turnsByChat);
        for (const [chatId, turns] of entries) {
          const t = turns[turns.length - 1];
          if (t?.kind === "agent" && t.agentState === "running") {
            patchTurn(chatId, t.id, { agentState: "error" });
            break;
          }
        }
      } else {
        toast.error(`Шлюз: ${frame.error}`);
      }
      break;
    }
  }
}

if (typeof window !== "undefined") {
  gtwSocket.onFrame(onFrame);
}

/* ─────────────── Store ─────────────── */

export const useLiveStore = create<DemoState>()((set, get) => ({
      chats: [],
      turnsByChat: {},
      artifacts: [],
      loadingChats: {},
      commands: seedCommands,
      activeChatId: null,
      sessionInfoByChat: {},

      requestSessionInfo: (chatId) => {
        gtwSocket.send({ type: "session_info", chat_id: chatId });
      },

      setActiveChat: (id) => set({ activeChatId: id }),

      loadChats: async () => {
        try {
          const res = await fetch("/api/chats", { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          const login = userId();
          const items: DemoChat[] = (data.chats || []).map(
            (c: { id: string; title: string; createdAt: string; updatedAt: string }) => ({
              id: c.id,
              title: c.title,
              userId: login,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              kind: "chat" as const,
            })
          );
          set({ chats: items });
        } catch {}
      },

      loadTurns: (chatId) => {
        if (get().turnsByChat[chatId] || get().loadingChats[chatId]) return;
        set((s) => ({ loadingChats: { ...s.loadingChats, [chatId]: true } }));
        gtwSocket.send({ type: "history", chat_id: chatId });
        // если шлюз не ответил (офлайн/рестарт) — не держим скелетон вечно
        setTimeout(() => {
          const s = useLiveStore.getState();
          if (!s.loadingChats[chatId]) return;
          const { [chatId]: _drop, ...restLoading } = s.loadingChats;
          useLiveStore.setState({
            loadingChats: restLoading,
            turnsByChat: { ...s.turnsByChat, [chatId]: s.turnsByChat[chatId] || [] },
          });
        }, 6000);
      },

      sendMessage: (chatId, text, attachments) => {
        const userTurn: Turn = {
          id: uid("tu"), kind: "user", createdAt: Date.now(), text,
          attachments: attachments?.length ? attachments : undefined, status: "done",
        };
        set((s) => {
          const exists = s.chats.some((c) => c.id === chatId);
          const chats = exists
            ? s.chats.map((c) =>
                c.id === chatId
                  ? { ...c, updatedAt: new Date().toISOString(), title: c.title === "Новый чат" ? text.slice(0, 42) : c.title }
                  : c
              )
            : [{
                id: chatId, title: text.slice(0, 42) || "Новый чат", userId: userId(),
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), kind: "chat" as const,
              }, ...s.chats];
          return {
            chats,
            turnsByChat: { ...s.turnsByChat, [chatId]: [...(s.turnsByChat[chatId] || []), userTurn] },
          };
        });
        ensureAgentTurn(chatId);
        const c = get().chats.find((x) => x.id === chatId);
        if (c) syncChat(c);
        const ready = (attachments || []).filter((a) => a.status === "ready" && a.fileId);
        gtwSocket.send({
          type: "user_message",
          chat_id: chatId,
          text,
          message_id: uid("m"),
          user_id: userId(),
          user_name: userId(),
          ...(ready.length
            ? { attachments: ready.map((a) => ({ fileId: a.fileId as string, name: a.name, mime: a.mime, size: a.sizeBytes })) }
            : {}),
        });
      },

      startChatWithMessage: (text, attachments) => {
        const chat = get().createChat();
        get().sendMessage(chat.id, text, attachments);
        return chat.id;
      },

      stop: (chatId) => {
        gtwSocket.send({ type: "stop", chat_id: chatId, user_id: userId() });
        clearSilence(chatId);
        const t = lastAgentTurn(chatId);
        if (t && t.agentState === "running") {
          patchTurn(chatId, t.id, {
            agentState: "cancelled",
            thinkingMs: t.thinkingMs ?? Math.max(0, Date.now() - t.createdAt),
            tools: t.tools?.map((tc) => (tc.status === "running" ? { ...tc, status: "cancelled" as const } : tc)),
          });
        }
      },

      decide: (chatId, turnId, approvalId, choice) => {
        gtwSocket.send({
          type: "approval_response",
          request_id: approvalId,
          choice: choice as ApprovalChoice,
          user_id: userId(),
        });
        // оптимистично; approval_ack подтвердит или вернёт в pending
        patchTurn(chatId, turnId, (t) => ({
          approval: t.approval
            ? { ...t.approval, state: choice === "deny" ? "denied" : "allowed" }
            : t.approval,
        }));
      },

      answerClarify: (chatId, turnId, clarifyId, response) => {
        gtwSocket.send({ type: "clarify_response", clarify_id: clarifyId, response });
        patchTurn(chatId, turnId, (t) => ({
          clarify: t.clarify ? { ...t.clarify, state: "answered" as const, answer: response } : t.clarify,
        }));
      },

      createChat: () => {
        const chat: DemoChat = {
          id: uid("c"), title: "Новый чат", userId: userId(),
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), kind: "chat",
        };
        set((s) => ({ chats: [chat, ...s.chats] }));
        syncChat(chat);
        return chat;
      },

      renameChat: (id, title) => {
        set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) }));
        const c = get().chats.find((x) => x.id === id);
        if (c) syncChat(c);
      },

      deleteChat: (id) => {
        clearSilence(id);
        set((s) => ({
          chats: s.chats.filter((c) => c.id !== id),
          artifacts: s.artifacts.filter((a) => a.chatId !== id),
        }));
        const { [id]: _drop, ...rest } = get().turnsByChat;
        set({ turnsByChat: rest });
        unsyncChat(id);
      },

      retryArtifact: () => {
        toast.info("Артефакты приходят от агента автоматически");
      },
}));