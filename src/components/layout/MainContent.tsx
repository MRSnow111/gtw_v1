"use client";

import { ChatView } from "@/components/chat/ChatView";
import { useChatStore } from "@/stores/chatStore";

export function MainContent() {
  const { activeChatId } = useChatStore();

  return (
    <main className="glass relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem]">
      <ChatView chatId={activeChatId ?? "new"} />
    </main>
  );
}
