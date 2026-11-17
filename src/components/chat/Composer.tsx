"use client";

import { Paperclip, ArrowUp, Search } from "lucide-react";
import { useRef, useState } from "react";

interface ComposerProps {
  chatId: string;
}

// Композер по референсу: строка ввода + нижний ряд иконок, круглая мятная отправка ↑.
export function Composer({ chatId }: ComposerProps) {
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  };

  const handleSend = () => {
    if (!text.trim()) return;
    console.log(`[Composer] Sending to chat ${chatId}:`, text);
    setText("");
    requestAnimationFrame(autosize);
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 3000); // mock
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="shrink-0 px-5 pb-5 pt-2">
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] transition-colors focus-within:border-[rgba(110,231,168,0.30)]">
        <div className="flex items-start gap-3 px-4 pt-3.5">
          <Search className="mt-0.5 h-4 w-4 shrink-0 text-3" strokeWidth={1.8} />
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autosize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Напишите сообщение…"
            className="w-full resize-none bg-transparent text-[15px] text-1 outline-none placeholder:text-3 max-h-[180px] overflow-y-auto"
            rows={1}
          />
        </div>
        <div className="flex items-center justify-between px-3.5 pb-3 pt-1.5">
          <div className="flex items-center gap-1">
            <button
              title="Прикрепить файл"
              className="flex h-8 w-8 items-center justify-center rounded-full text-2 transition-colors hover:bg-white/[0.07] hover:text-1"
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.8} />
            </button>
            <button
              title="Загрузить"
              className="flex h-8 w-8 items-center justify-center rounded-full text-2 transition-colors hover:bg-white/[0.07] hover:text-1"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 16V4" />
                <path d="M7 9l5-5 5 5" />
                <path d="M4 20h16" />
              </svg>
            </button>
          </div>

          {isGenerating ? (
            <button
              onClick={() => setIsGenerating(false)}
              title="Остановить"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(220,80,80,0.85)] text-white shadow-[0_0_18px_rgba(220,80,80,0.35)] transition-transform active:scale-95"
            >
              <span className="block h-3 w-3 rounded-[3px] bg-white" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              title="Отправить"
              className="btn-mint flex h-10 w-10 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
