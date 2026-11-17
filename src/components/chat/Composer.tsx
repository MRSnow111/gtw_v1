"use client";

import { Button } from "@/components/ui/button";
import { Paperclip, Send, StopCircle } from "lucide-react";
import { useRef, useState } from "react";

interface ComposerProps {
  chatId: string;
}

export function Composer({ chatId }: ComposerProps) {
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`; // 1→~8 строк, дальше внутренний скролл
  };

  const handleSend = () => {
    if (!text.trim()) return;
    console.log(`[Composer] Sending to chat ${chatId}:`, text);
    setText("");
    requestAnimationFrame(autosize);
    setIsGenerating(true);

    // Mock stop after 3 seconds
    setTimeout(() => setIsGenerating(false), 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="shrink-0 border-t border-[rgba(220,235,230,0.08)] p-4">
      <div className="glass-light relative mx-auto max-w-4xl rounded-2xl focus-within:border-[rgba(143,184,174,0.35)]">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autosize();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Введите сообщение или /команду..."
          className="w-full resize-none bg-transparent px-4 pb-12 pt-3 text-sm text-[rgba(220,235,230,0.85)] placeholder:text-[rgba(220,235,230,0.35)] focus-visible:outline-none min-h-[56px] max-h-[200px] overflow-y-auto rounded-2xl"
          rows={1}
        />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-8 w-8 text-[rgba(220,235,230,0.4)] hover:bg-[rgba(143,184,174,0.08)] hover:text-[rgba(220,235,230,0.8)]"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() && !isGenerating}
            className={
              isGenerating
                ? "h-8 w-8 rounded-full bg-[rgba(220,80,80,0.85)] text-white hover:bg-[rgba(220,80,80,1)]"
                : "h-8 w-8 rounded-full bg-gradient-to-r from-[#8FB8AE] to-[#4D7B73] text-[#0A1412] hover:from-[#9EC4BC] hover:to-[#5A8A80]"
            }
          >
            {isGenerating ? (
              <StopCircle className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
