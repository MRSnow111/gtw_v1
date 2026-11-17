"use client";

import { useParams } from "next/navigation";
import { ChatView } from "@/components/chat/ChatView";
import { useDemoStore } from "@/stores/demoStore";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const chatId = params?.id ?? null;
  const chats = useDemoStore((s) => s.chats);
  const title = chats.find((c) => c.id === chatId)?.title;

  return <ChatView chatId={chatId} title={title} />;
}
