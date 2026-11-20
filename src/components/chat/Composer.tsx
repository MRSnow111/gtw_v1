"use client";

import { ArrowUp, Paperclip, Search, FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ComposerProps { chatId: string }

export function Composer({ chatId }: ComposerProps) {
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const autosize = () => {
    const textarea = taRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`;
  };

  useEffect(() => {
    const onPrompt = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail) return;
      setText((current) => current ? `${current} ${detail}` : detail);
      requestAnimationFrame(() => { taRef.current?.focus(); autosize(); });
    };
    window.addEventListener("gtw:composer-prompt", onPrompt);
    return () => window.removeEventListener("gtw:composer-prompt", onPrompt);
  }, []);

  const handleSend = () => {
    if (!text.trim() || isGenerating) return;
    // В этой версии оставлен существующий mock-поток; интеграцию отправки
    // необходимо подключить к согласованному socket-контракту отдельно.
    console.log(`[Composer] Sending to chat ${chatId}:`, text);
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    setIsGenerating(true);
    window.setTimeout(() => setIsGenerating(false), 3000);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="shrink-0 px-3 pb-3 pt-2 sm:px-5 sm:pb-5">
      <div
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); }}
        className={`relative rounded-[23px] border bg-[linear-gradient(145deg,rgba(220,235,230,.085),rgba(15,39,32,.48))] shadow-[0_18px_48px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.11)] backdrop-blur-2xl transition-all duration-200 ${dragging ? "border-[rgba(143,184,174,.55)] bg-[rgba(143,184,174,.13)] shadow-[0_0_34px_rgba(143,184,174,.12)]" : "border-white/[.12] focus-within:border-[rgba(143,184,174,.30)]"}`}
      >
        {dragging && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[23px] bg-[#0b1b16]/85 text-sm text-[#C3DED2]"><FileUp className="h-5 w-5" />Перетащите файлы сюда</div>}
        <div className="flex items-start gap-3 px-4 pt-4 sm:px-5">
          <Search className="mt-1 h-4 w-4 shrink-0 text-3" strokeWidth={1.7} />
          <textarea
            ref={taRef}
            value={text}
            onChange={(event) => { setText(event.target.value); autosize(); }}
            onKeyDown={handleKeyDown}
            placeholder="Напишите сообщение…"
            aria-label="Сообщение агенту"
            className="max-h-48 min-h-[28px] w-full resize-none bg-transparent py-0.5 text-[13px] leading-6 text-1 outline-none placeholder:text-3 sm:text-[14px]"
            rows={1}
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-3 pt-2 sm:px-4">
          <div className="flex items-center gap-1.5">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files?.length) console.info("Selected files:", Array.from(event.target.files).map((file) => file.name)); }} />
            <button type="button" onClick={() => fileRef.current?.click()} title="Прикрепить файл" className="flex h-8 w-8 items-center justify-center rounded-full text-2 transition-colors hover:bg-white/[.07] hover:text-1"><Paperclip className="h-4 w-4" strokeWidth={1.7} /></button>
            <span className="hidden text-[10px] text-3 sm:inline">Enter — отправить · Shift + Enter — новая строка</span>
          </div>
          {isGenerating ? (
            <button type="button" onClick={() => setIsGenerating(false)} title="Остановить" className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(220,112,112,.28)] bg-[rgba(160,65,65,.78)] text-white shadow-[0_0_22px_rgba(220,90,90,.18)] transition-transform active:scale-95"><span className="h-3 w-3 rounded-[3px] bg-white" /></button>
          ) : (
            <button type="button" onClick={handleSend} disabled={!text.trim()} title="Отправить" className="btn-mint flex h-10 w-10 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-35"><ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.2} /></button>
          )}
        </div>
      </div>
      <div className="mt-2 hidden items-center justify-center gap-1 text-[9px] tracking-wide text-[rgba(165,187,179,.48)] sm:flex"><span>GTW</span><span className="opacity-40">·</span><span>Проверяйте команды перед подтверждением</span></div>
    </div>
  );
}
