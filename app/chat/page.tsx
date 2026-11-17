"use client";

import { useEffect } from "react";
import { ChatView } from "@/components/chat/ChatView";
import { useDemoStore } from "@/stores/demoStore";

export default function NewChatPage() {
  const setActiveChat = useDemoStore((s) => s.setActiveChat);

  useEffect(() => setActiveChat(null), [setActiveChat]);

  return <ChatView chatId={null} />;
}
