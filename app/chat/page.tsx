"use client";

import { useEffect } from "react";
import { ChatView } from "@/components/chat/ChatView";
import { useAgentStore } from "@/stores/agentStore";

export default function NewChatPage() {
  const setActiveChat = useAgentStore((s) => s.setActiveChat);

  useEffect(() => setActiveChat(null), [setActiveChat]);

  return <ChatView chatId={null} />;
}
