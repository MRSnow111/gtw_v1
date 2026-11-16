"use client";

import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";

interface ChatViewProps {
  chatId: string;
}

export function ChatView({ chatId }: ChatViewProps) {
  return (
    <div className="flex-1 flex flex-col h-full">
      <ChatHeader chatId={chatId} />
      <MessageList chatId={chatId} />
      <Composer chatId={chatId} />
    </div>
  );
}
