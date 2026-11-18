"use client";

import { useEffect, useRef } from "react";
import { BarChart3, Code2, FileText, Terminal, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/stores/messageStore";
import { useUiStore } from "@/stores/uiStore";

interface MessageListProps {
  chatId: string;
}

const SUGGESTIONS: { icon: LucideIcon; title: string; hint: string; prompt: string }[] = [
  { icon: Code2, title: "Написать код", hint: "Разработка и отладка", prompt: "Помоги написать код: " },
  { icon: Terminal, title: "Работа с сервером", hint: "Команды и инструменты", prompt: "Помоги на сервере: " },
  { icon: BarChart3, title: "Анализ данных", hint: "Визуализация и отчёты", prompt: "Проанализируй данные: " },
  { icon: FileText, title: "Работа с файлами", hint: "Обработка и поиск", prompt: "Найди и обработай файлы: " },
];

function EmptyState() {
  const setDraft = useUiStore((s) => s.setDraft);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center px-4 py-8 text-center">
      <div className="glass-inner animate-fade-up flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.4rem] shadow-[0_0_50px_-8px_hsl(var(--glow)/0.55)]">
        <LogoMark className="h-10 w-10" />
      </div>
      <h1 className="animate-fade-up mt-7 text-3xl font-medium tracking-tight [animation-delay:60ms] sm:text-4xl">
        Чем займёмся?
      </h1>
      <p className="animate-fade-up mt-2 text-muted-foreground [animation-delay:120ms]">
        Ваш персональный AI-агент готов к работе
      </p>

      <div className="mt-9 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map(({ icon: Icon, title, hint, prompt }, i) => (
          <button
            key={title}
            type="button"
            onClick={() => setDraft(prompt)}
            style={{ animationDelay: `${180 + i * 60}ms` }}
            className="glass-inner animate-fade-up group flex items-center gap-4 rounded-2xl p-4 text-left hover:-translate-y-0.5 hover:border-primary/30"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{title}</span>
              <span className="block text-sm text-muted-foreground">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MessageList({ chatId }: MessageListProps) {
  const messages = useMessageStore((state) => state.messagesByChat[chatId] || []);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className={cn("animate-fade-up flex gap-3", isUser ? "justify-end" : "justify-start")}>
              {!isUser && (
                <span className="glass-inner mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
                  <LogoMark className="h-5 w-5" />
                </span>
              )}
              <div
                className={cn(
                  "max-w-[85%] text-[15px] leading-relaxed sm:max-w-[75%]",
                  isUser
                    ? "rounded-2xl rounded-br-md bg-primary/20 px-4 py-2.5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]"
                    : "py-1"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.status === "streaming" && (
                  <span className="ml-1 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-primary" />
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
