"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { gtwSocket } from "@/lib/gtwSocket";
import type { GtwServerFrame, ModelProvider } from "@/types/events";

/** Sentinel-чат для каталога на welcome-экране (до создания реального чата).
 *  По нему только запрашиваем список моделей — set_model и авто-выбор B1 не делаем. */
export const DRAFT_CHAT_ID = "__draft__";

/**
 * LIVE-стор пикера моделей в чате. Каталог приходит кадром "models"
 * (для не-админа server.js фильтрует его по белому списку пользователя),
 * переключение — кадром "set_model" с подтверждением "set_model_ack".
 * Отдельный стор, чтобы не расширять общий DemoState/demoStore.
 */
export interface ModelCatalog {
  current: { model: string; provider: string } | null;
  providers: ModelProvider[];
  restricted: boolean;
}

interface ModelState {
  catalogByChat: Record<string, ModelCatalog>;
  loadingByChat: Record<string, boolean>;
  switchingByChat: Record<string, boolean>;
  /** Модель, выбранная ДО начала чата (welcome-экран); применится к первому сообщению. */
  pendingModel: string | null;
  requestModels: (chatId: string) => void;
  setModel: (chatId: string, model: string) => void;
  setPendingModel: (model: string | null) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  catalogByChat: {},
  loadingByChat: {},
  switchingByChat: {},
  pendingModel: null,

  requestModels: (chatId) => {
    set((s) => ({ loadingByChat: { ...s.loadingByChat, [chatId]: true } }));
    gtwSocket.send({ type: "models", chat_id: chatId });
    // шлюз может не ответить (офлайн) — не держим скелетон вечно
    setTimeout(() => {
      set((s) => {
        if (!s.loadingByChat[chatId]) return {};
        const { [chatId]: _drop, ...rest } = s.loadingByChat;
        return { loadingByChat: rest };
      });
    }, 12000);
  },

  setModel: (chatId, model) => {
    set((s) => ({ switchingByChat: { ...s.switchingByChat, [chatId]: true } }));
    gtwSocket.send({ type: "set_model", chat_id: chatId, model });
  },

  setPendingModel: (model) => set({ pendingModel: model }),
}));

if (typeof window !== "undefined") {
  // B1: чаты, где уже пробовали авто-выбор разрешённой модели (защита от цикла).
  const autoSwitchTried = new Set<string>();
  gtwSocket.onFrame((frame: GtwServerFrame) => {
    if (frame.type === "models") {
      useModelStore.setState((s) => {
        const { [frame.chat_id]: _drop, ...restLoading } = s.loadingByChat;
        return {
          loadingByChat: restLoading,
          catalogByChat: {
            ...s.catalogByChat,
            [frame.chat_id]: {
              current: frame.current || null,
              providers: frame.providers || [],
              restricted: !!frame.restricted,
            },
          },
        };
      });
      // B1: новый чат ограниченного пользователя показывает модель профиля по умолчанию
      // (напр. qwen3.8), которая может быть НЕ в белом списке. Авто-выбираем первую
      // разрешённую, чтобы агент работал на доступной модели, а не блокировался гейтом.
      const st = useModelStore.getState();
      const cat = st.catalogByChat[frame.chat_id];
      if (cat && cat.restricted && cat.current && frame.chat_id !== DRAFT_CHAT_ID && !st.switchingByChat[frame.chat_id]) {
        const allowed = cat.providers.flatMap((p) => (p.models || []).map((m) => `${p.name}/${m}`));
        const curKey = `${cat.current.provider}/${cat.current.model}`;
        const triedKey = `${frame.chat_id}:${curKey}`;
        if (allowed.length && !allowed.includes(curKey) && !autoSwitchTried.has(triedKey)) {
          autoSwitchTried.add(triedKey);
          st.setModel(frame.chat_id, allowed[0]);
        }
      }
    } else if (frame.type === "set_model_ack") {
      useModelStore.setState((s) => {
        const { [frame.chat_id]: _drop, ...restSwitch } = s.switchingByChat;
        const cat = s.catalogByChat[frame.chat_id];
        let catalogByChat = s.catalogByChat;
        if (frame.ok && cat) {
          const mdl = String(frame.model || "");
          const slash = mdl.indexOf("/");
          const provider = slash >= 0 ? mdl.slice(0, slash) : cat.current?.provider || "";
          const model = slash >= 0 ? mdl.slice(slash + 1) : mdl;
          catalogByChat = {
            ...s.catalogByChat,
            [frame.chat_id]: { ...cat, current: { model, provider } },
          };
        }
        return { switchingByChat: restSwitch, catalogByChat };
      });
      if (frame.ok) {
        toast.success(`Модель переключена на «${String(frame.model || "").split("/").pop()}»`);
        // метрики сессии обновятся под новую модель
        gtwSocket.send({ type: "session_info", chat_id: frame.chat_id });
      } else {
        toast.error("Агент не подтвердил переключение модели");
      }
    } else if (frame.type === "error" && frame.error === "model_forbidden") {
      // индикаторы сбрасываем; понятный тост показывает liveStore
      useModelStore.setState({ switchingByChat: {}, loadingByChat: {} });
    }
  });
}
