import { create } from "zustand";
import type { Message } from "@/types/message";

interface MessageStore {
  messagesByChat: Record<string, Message[]>;
  streamingMessageId: string | null;
  setMessagesByChat: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  setStreamingMessageId: (id: string | null) => void;
}

export const useMessageStore = create<MessageStore>((set) => ({
  messagesByChat: {},
  streamingMessageId: null,
  setMessagesByChat: (chatId, messages) =>
    set((state) => ({
      messagesByChat: { ...state.messagesByChat, [chatId]: messages },
    })),
  addMessage: (chatId, message) =>
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...(state.messagesByChat[chatId] || []), message],
      },
    })),
  updateMessage: (chatId, messageId, updates) =>
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: (state.messagesByChat[chatId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    })),
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
}));
