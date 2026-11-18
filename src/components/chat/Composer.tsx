"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, Square, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useWsStore } from "@/stores/wsStore";

interface ComposerProps {
  chatId: string;
}

const LINE = 24; // px, line-height textarea
const MAX_LINES = 8;

export function Composer({ chatId }: ComposerProps) {
  const { draft: text, setDraft: setText } = useUiStore();
  const status = useWsStore((s) => s.status);
  const [isGenerating, setIsGenerating] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // автораст: 1 → 8 строк, дальше скролл внутри (docs/design.md §4)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, LINE * MAX_LINES)}px`;
  }, [text]);

  // карточки-подсказки подставляют текст — возвращаем фокус в поле
  useEffect(() => {
    if (text) ref.current?.focus();
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    if (isGenerating) {
      // TODO: chat.cancel
      setIsGenerating(false);
      return;
    }
    if (!text.trim()) return;
    console.log(`[Composer] Sending to chat ${chatId}:`, text);
    setText("");
    setIsGenerating(true);

    // Mock stop after 3 seconds
    setTimeout(() => setIsGenerating(false), 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const offline = status === "reconnecting";
  const canSend = isGenerating || text.trim().length > 0;

  return (
    <div className="px-4 pb-4 sm:px-6 sm:pb-5">
      <div className="mx-auto max-w-3xl">
        {offline && (
          <div
            role="status"
            className="animate-fade-up mx-auto mb-2 flex w-fit items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3.5 py-1.5 text-xs text-warning"
          >
            <WifiOff className="h-3.5 w-3.5" />
            Соединение потеряно. Переподключение…
          </div>
        )}

        <div className="glass-inner flex items-end gap-2 rounded-[1.6rem] p-2 pl-3 transition-shadow focus-within:border-primary/40 focus-within:shadow-[0_0_0_4px_hsl(var(--primary)/0.1)] hover:bg-[var(--glass-bg)]">
          <button
            type="button"
            aria-label="Прикрепить файл"
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишите сообщение…"
            rows={1}
            style={{ lineHeight: `${LINE}px` }}
            className="scroll-thin min-h-[44px] flex-1 resize-none bg-transparent py-[10px] text-[15px] outline-none placeholder:text-muted-foreground"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label={isGenerating ? "Остановить" : "Отправить"}
            className={cn(
              "mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all",
              isGenerating
                ? "bg-destructive text-destructive-foreground shadow-[0_8px_24px_-8px_hsl(var(--destructive)/0.7)]"
                : "btn-glow disabled:opacity-35 disabled:shadow-none"
            )}
          >
            {isGenerating ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-5 w-5" strokeWidth={2.4} />}
          </button>
        </div>
        <p className="mt-2 hidden text-center text-[11px] text-muted-foreground/70 sm:block">
          Enter — отправить · Shift+Enter — новая строка
        </p>
      </div>
    </div>
  );
}
