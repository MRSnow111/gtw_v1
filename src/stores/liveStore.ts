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
import { useModelStore } from "@/stores/modelStore";

/**
 * LIVE store — тот же интерфейс, что у demoStore, но ходы строятся из реальных
 * WS-кадров gtw-адаптера (typing/draft/message/message_edit/approval/clarify/…).
 * Список чатов хранится на СЕРВЕРЕ per-login (/api/chats) и грузится при входе —
 * изоляция между аккаунтами и синхронизация между устройствами. История ходов
 * запрашивается у шлюза (history).
 */

// Тишина после последнего кадра => ход завершён. 2500 мс рвал живую генерацию:
// долгая пауза инструмента (tool без status-кадров) закрывала ход, а следующий
// typing создавал ВТОРОЙ ход — в ленте появлялся разрыв «генерация».
const SILENCE_MS = 10000;
// Ход, закрытый именно таймером тишины (а не концом сообщения), ещё живой:
// если кадр пришёл в этом окне — переоткрываем ЕГО, а не создаём новый ход.
const SILENCE_REOPEN_MS = 30000;
const silenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Момент явной остановки пользователем: служебные кадры после stop не воскрешают ход.
const stoppedAt = new Map<string, number>();
// doneReason хода, закрытого тишиной: chatId → {turnId, at}. Тип Turn живёт в
// src/lib/demoData.ts (вне зоны волны 4 / агента B), поэтому причина хранится
// здесь, а не полем хода — семантика та же: «закрыт таймером, можно переоткрыть».
const silenceDone = new Map<string, { turnId: string; at: number }>();
// Момент/поколение history-запроса per-chat: кадр history не должен затирать
// локальные ходы, созданные ПОСЛЕ запроса (гонка loadTurns ↔ sendMessage).
const historyReqAt = new Map<string, number>();
const historyGen = new Map<string, number>();
const HISTORY_TIMEOUT_MS = 6000;
// history-запрос старше этого возраста считаем зависшим: повторный вход в чат
// сбрасывает флаг и перезапрашивает историю, не дожидаясь 6-секундного таймаута.
const HISTORY_STALE_MS = 1500;

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Tool-progress уведомления ядра («💻 Running …», «📚 Reading skill …») приходят как
// message/message_edit БЕЗ metadata (у GTW пустой _progress_metadata) — это шаги
// инструмента, НЕ финальный ответ. Прячем их в statusNotes: compact-пользователь не
// видит детали (только строка статуса), admin — список шагов в «Рассуждениях».
// Regex совпадает с scripts/probe.py::_TOOL_PROGRESS (проверен на живых кадрах).
const TOOL_PROGRESS_RE =
  /^\s*(?:💻|🔧|🛠|📁|📂|🌐|🔍|🔎|📄|📝|⚙|🖥|📦|🧰|🗑|✏|📋|🧪|🚀|💾|📥|📤|🔨|📡|📚|📖|🗂|📰)\uFE0F?\s/;
const isToolProgress = (text: string) => TOOL_PROGRESS_RE.test(text || "");

// Шаг tool-progress в statusNotes (Record<key,text>) под стабильным ключом message_id:
// растущие edit-снапшоты одного сообщения обновляют свою строку, не плодят дубли.
function appendStep(t: Turn, key: string, text: string): Record<string, string> {
  const s = (text || "").trim();
  if (!s) return t.statusNotes || {};
  return { ...(t.statusNotes || {}), [key || "step"]: s };
}

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

/**
 * Слияние снимка истории со СВЕЖИМИ локальными ходами (созданными после отправки
 * history-запроса). Дедуп по id/messageId, порядок по времени создания: локальные
 * оптимистичные ходы всегда новее снапшота, поэтому дописываются в хвост.
 */
function mergeTurns(history: Turn[], fresh: Turn[]): Turn[] {
  const ids = new Set(history.map((t) => t.id));
  const msgIds = new Set<string>(history.map((t) => t.messageId).filter(Boolean) as string[]);
  // Дедуп только по идентичностям (id/messageId): «свежие» ходы созданы ПОСЛЕ
  // снимка, поэтому по тексту их сверять нельзя — два одинаковых сообщения подряд
  // были бы ошибочно схлопнуты в одно.
  const keep = fresh.filter((t) => !ids.has(t.id) && !(t.messageId && msgIds.has(t.messageId)));
  if (!keep.length) return history;
  const out = [...history];
  for (const t of keep) {
    const i = out.findIndex((x) => x.createdAt > t.createdAt);
    if (i === -1) out.push(t);
    else out.splice(i, 0, t);
  }
  return out;
}

/** Гарантирует running-ход агента в конце ленты (создаёт, если нужно). */
function ensureAgentTurn(chatId: string): Turn {
  const last = lastAgentTurn(chatId);
  if (last && last.agentState === "running") return last;
  // После явной остановки служебные кадры (typing, «no active» и т.п.) не должны
  // воскрешать running-ход — новый ход создаёт только user_message.
  const sa = stoppedAt.get(chatId);
  if (sa !== undefined && Date.now() - sa < 15000 && last) return last;
  // Ход закрыт ТАЙМЕРОМ ТИШИНЫ (doneReason 'silence'), а не концом сообщения:
  // значит генерация просто лагала — переоткрываем его, иначе следующий typing
  // создаст второй ход и лента разорвётся («генерация» посередине ответа).
  const sd = silenceDone.get(chatId);
  if (last && sd && sd.turnId === last.id && Date.now() - sd.at < SILENCE_REOPEN_MS) {
    silenceDone.delete(chatId);
    patchTurn(chatId, last.id, { agentState: "running", emptySilence: false });
    return { ...last, agentState: "running" };
  }
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
  // любой явный конец/пауза ожидания снимает метку «ход закрыт тишиной»
  silenceDone.delete(chatId);
}

/** Ход считается завершённым, если шлюз замолчал и нет ожидания пользователя. */
function armSilence(chatId: string) {
  clearSilence(chatId);
  silenceTimers.set(chatId, setTimeout(() => {
    silenceTimers.delete(chatId);
    const t = lastAgentTurn(chatId);
    if (!t || t.agentState !== "running") return;
    if (t.approval?.state === "pending" || t.clarify?.state === "pending") return;
    // D6: ход замолчал, не принеся ни ответа, ни инструментов, ни ожидания —
    // помечаем, чтобы UI показал причину вместо вечного «думает» → тишина.
    const empty = !(t.answer || "").trim() && !(t.tools && t.tools.length > 0);
    patchTurn(chatId, t.id, {
      agentState: "done",
      thinkingMs: t.thinkingMs ?? Math.max(0, Date.now() - t.createdAt),
      ...(empty ? { emptySilence: true } : {}),
    });
    // doneReason='silence': ход закрыт таймером, а не концом сообщения — следующий
    // кадр в окне SILENCE_REOPEN_MS переоткроет его, а не создаст второй ход.
    silenceDone.set(chatId, { turnId: t.id, at: Date.now() });
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
      body: JSON.stringify({ chat_id: chat.id, title: chat.title, project_id: chat.projectId ?? null }),
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
      // ВАЖНО: notify=true ядро Hermes ставит на КАЖДЫЙ финальный ответ агента
      // (gateway _mark_notify_metadata — флаг «достоин push-уведомления» для
      // мессенджеров), а НЕ только на служебные кадры («⚡ Stopped», «no active»).
      // Глотать notify-кадры нельзя: ответы агента перестают рендериться
      // (симптом «Остановлено» без текста, ответ виден только после F5).
      // Служебные кадры после /stop не воскрешают ход благодаря guard stoppedAt
      // в ensureAgentTurn — этого достаточно, отдельная notify-ветка не нужна.
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
      // Tool-progress без metadata («📚 Reading skill …», «💻 Running …») — шаг
      // инструмента, не финальный ответ: копим в statusNotes (скрыто у compact).
      if (isToolProgress(frame.content || "")) {
        const t = ensureAgentTurn(chatId);
        patchTurn(chatId, t.id, (prev) => ({
          statusNotes: appendStep(prev, frame.message_id || "step", frame.content || ""),
          agentState: "running",
          messageId: frame.message_id || prev.messageId,
        }));
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
      // Снапшоты tool-progress («📚 Reading skill … → references/…») — шаги, не ответ.
      if (isToolProgress(frame.content || "")) {
        patchTurn(chatId, t.id, (prev) => ({
          statusNotes: appendStep(prev, frame.message_id || "step", frame.content || ""),
          agentState: "running",
        }));
        if (frame.finalize) {
          clearSilence(chatId);
          patchTurn(chatId, t.id, {
            agentState: "done",
            thinkingMs: t.thinkingMs ?? Math.max(0, Date.now() - t.createdAt),
          });
        } else {
          armSilence(chatId);
        }
        break;
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
      const chatId = frame.chat_id;
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
        const { [chatId]: _drop, ...restLoading } = s.loadingChats;
        // Гонка loadTurns ↔ sendMessage: снимок истории сделан ДО локальных ходов,
        // поэтому ходы, созданные после отправки запроса, перезаписью терялись
        // (сообщение пользователя исчезало из ленты). Merge: история + свежие
        // локальные ходы, дедуп по id/messageId, порядок по времени создания.
        // Живой running-ход не выбрасываем никогда: иначе запоздалый history
        // «съедает» идущую генерацию, а следующий кадр создаст второй ход.
        const reqAt = historyReqAt.get(chatId);
        const prev = s.turnsByChat[chatId] || [];
        const fresh = prev.filter(
          (t) => (reqAt !== undefined && t.createdAt >= reqAt) ||
            (t.kind === "agent" && t.agentState === "running")
        );
        const merged = fresh.length ? mergeTurns(turns, fresh) : turns;
        return {
          loadingChats: restLoading,
          turnsByChat: { ...s.turnsByChat, [chatId]: merged },
        };
      });
      // historyReqAt НЕ удаляем: на чат мог уйти повторный запрос (переоткрытие),
      // и запоздалый ответ обязан так же щадить свежие локальные ходы.
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

      setActiveChat: (id) => {
        // переход к чату сбрасывает черновой выбор модели с welcome-экрана
        useModelStore.getState().setPendingModel(null);
        // B4 (аудит B2): history-запрос мог потеряться (рестарт шлюза/офлайн) —
        // флаг loadingChats держали до 6-секундного таймаута, и повторный вход в
        // чат показывал скелетон вместо мгновенного перезапроса. Сбрасываем
        // зависший флаг (запрос старше HISTORY_STALE_MS) — MessageList тут же
        // дёрнет loadTurns заново.
        const s = get();
        const reqAt = id ? historyReqAt.get(id) : undefined;
        if (id && s.loadingChats[id] && !s.turnsByChat[id] &&
            reqAt !== undefined && Date.now() - reqAt > HISTORY_STALE_MS) {
          const { [id]: _drop, ...restLoading } = s.loadingChats;
          set({ activeChatId: id, loadingChats: restLoading });
          return;
        }
        set({ activeChatId: id });
      },

      loadChats: async () => {
        try {
          const res = await fetch("/api/chats", { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          const login = userId();
          const items: DemoChat[] = (data.chats || []).map(
            (c: { id: string; title: string; projectId?: string | null; createdAt: string; updatedAt: string }) => ({
              id: c.id,
              title: c.title,
              userId: login,
              projectId: c.projectId ?? null,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              kind: "chat" as const,
            })
          );
          set({ chats: items });
        } catch {}
      },

      loadTurns: (chatId) => {
        const cur = get();
        if (cur.turnsByChat[chatId]) return;
        if (cur.loadingChats[chatId]) {
          // B4 (аудит B2): запрос истории мог потеряться (офлайн/рестарт шлюза) —
          // раньше флаг держали до 6-секундного таймаута и скелетон висел. Повторный
          // вход в чат сбрасывает зависший флаг и уходит на перезапрос немедленно.
          const reqAt = historyReqAt.get(chatId);
          if (reqAt === undefined || Date.now() - reqAt <= HISTORY_STALE_MS) return;
          const { [chatId]: _drop, ...rest } = cur.loadingChats;
          set({ loadingChats: rest });
        }
        const gen = (historyGen.get(chatId) ?? 0) + 1;
        historyGen.set(chatId, gen);
        historyReqAt.set(chatId, Date.now());
        set((s) => ({ loadingChats: { ...s.loadingChats, [chatId]: true } }));
        gtwSocket.send({ type: "history", chat_id: chatId });
        // если шлюз не ответил (офлайн/рестарт) — не держим скелетон вечно
        setTimeout(() => {
          // более свежий запрос в пути: старый таймаут не трогает его флаг
          if (historyGen.get(chatId) !== gen) return;
          const s = useLiveStore.getState();
          if (!s.loadingChats[chatId]) return;
          const { [chatId]: _drop, ...restLoading } = s.loadingChats;
          useLiveStore.setState({
            loadingChats: restLoading,
            turnsByChat: { ...s.turnsByChat, [chatId]: s.turnsByChat[chatId] || [] },
          });
        }, HISTORY_TIMEOUT_MS);
      },

      sendMessage: (chatId, text, attachments, initialModel) => {
        stoppedAt.delete(chatId);
        // новое сообщение пользователя = новый ход: ход, закрытый таймером тишины,
        // не должен переоткрываться ответом на этот запрос
        silenceDone.delete(chatId);
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
          // модель, выбранная до начала чата: server.js применит её к первому ходу
          ...(initialModel ? { model: initialModel } : {}),
          ...(ready.length
            ? { attachments: ready.map((a) => ({ fileId: a.fileId as string, name: a.name, mime: a.mime, size: a.sizeBytes })) }
            : {}),
        });
      },

      startChatWithMessage: (text, attachments) => {
        const chat = get().createChat();
        // pending-модель с welcome-экрана уходит в первый user_message (frame.model)
        const pending = useModelStore.getState().pendingModel;
        if (pending) useModelStore.getState().setPendingModel(null);
        get().sendMessage(chat.id, text, attachments, pending ?? undefined);
        return chat.id;
      },

      stop: (chatId) => {
        gtwSocket.send({ type: "stop", chat_id: chatId, user_id: userId() });
        stoppedAt.set(chatId, Date.now());
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
        // B4 (аудит B4): approval_request снимал таймер тишины, а вооружали мы его
        // только по approval_ack — потерянный ack навсегда вешал running-ход. После
        // решения пользователя вооружаем таймер сами (pending-блока уже нет).
        armSilence(chatId);
      },

      answerClarify: (chatId, turnId, clarifyId, response) => {
        gtwSocket.send({ type: "clarify_response", clarify_id: clarifyId, response });
        patchTurn(chatId, turnId, (t) => ({
          clarify: t.clarify ? { ...t.clarify, state: "answered" as const, answer: response } : t.clarify,
        }));
        // тот же смысл, что у decide: потерянный clarify_ack не вешает ход
        armSilence(chatId);
      },

      createChat: (projectId) => {
        const chat: DemoChat = {
          id: uid("c"), title: "Новый чат", userId: userId(),
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), kind: "chat",
          projectId: projectId ?? null,
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
        // служебные per-chat карты не должны переживать удалённый чат
        stoppedAt.delete(id);
        historyReqAt.delete(id);
        historyGen.delete(id);
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

      removeArtifact: (id) => set((s) => ({ artifacts: s.artifacts.filter((a) => a.id !== id) })),
}));