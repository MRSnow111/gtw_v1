"use client";

import { useParams } from "next/navigation";
import { ChatView } from "@/components/chat/ChatView";
import { useAgentStore } from "@/stores/agentStore";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const chatId = params?.id ?? null;
  const chats = useAgentStore((s) => s.chats);
  const title = chats.find((c) => c.id === chatId)?.title;

  return <ChatView chatId={chatId} title={title} />;
}
