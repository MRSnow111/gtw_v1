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
        <div className="mt-10 text-center text-3">
          Отправьте сообщение, чтобы начать
        </div>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "user" ? (
              <div className="max-w-[70%] rounded-2xl rounded-br-md bg-[rgba(134,227,176,0.92)] p-3 text-[#0A1410]">
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            ) : (
              // Ответ агента — текст без карточки на фоне ленты (docs/design.md §10)
              <div className="max-w-[80%] p-1 text-1">
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.status === "streaming" && (
                  <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-[#6EE7A8] align-middle" />
                )}
              </div>
            )}
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
