"use client";

import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";

interface ChatViewProps {
  chatId: string | null;
  title?: string;
}

export function ChatView({ chatId, title }: ChatViewProps) {
  return (
    <>
      <ChatHeader title={title} />
      <div className="min-h-0 flex-1">
        <MessageList chatId={chatId} />
      </div>
      <Composer chatId={chatId} />
    </>
  );
}
