"use client";

import { useMessageStore } from "@/stores/messageStore";
import { useEffect, useRef } from "react";

interface MessageListProps {
  chatId: string;
}

export function MessageList({ chatId }: MessageListProps) {
  const messages = useMessageStore((state) => state.messagesByChat[chatId] || []);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="text-center text-muted-foreground mt-10">
          Отправьте сообщение, чтобы начать
        </div>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.status === "streaming" && (
                <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
              )}
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
