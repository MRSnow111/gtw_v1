import { create } from "zustand";
import type { Chat } from "@/types/chat";

interface ChatStore {
  activeChatId: string | null;
  chats: Chat[];
  setActiveChat: (chatId: string | null) => void;
  setChats: (chats: Chat[]) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  activeChatId: null,
  chats: [],
  setActiveChat: (chatId) => set({ activeChatId: chatId }),
  setChats: (chats) => set({ chats }),
}));
