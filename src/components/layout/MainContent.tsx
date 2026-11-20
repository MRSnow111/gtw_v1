"use client";

import { ChatView } from "@/components/chat/ChatView";
import { useChatStore } from "@/stores/chatStore";

export function MainContent() {
  const { activeChatId } = useChatStore();

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      {activeChatId ? (
        <ChatView chatId={activeChatId} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Выберите чат или создайте новый
        </div>
      )}
    </main>
  );
}
