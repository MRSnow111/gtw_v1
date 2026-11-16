"use client";

import { Button } from "@/components/ui/button";
import { Paperclip, Send, StopCircle } from "lucide-react";
import { useState } from "react";

interface ComposerProps {
  chatId: string;
}

export function Composer({ chatId }: ComposerProps) {
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSend = () => {
    if (!text.trim()) return;
    console.log(`[Composer] Sending to chat ${chatId}:`, text);
    setText("");
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
    <div className="border-t bg-card p-4">
      <div className="max-w-4xl mx-auto relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Введите сообщение или /команду..."
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] max-h-[200px]"
          rows={2}
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-2">
          <Button variant="ghost" size="icon" type="button" className="h-8 w-8 text-muted-foreground">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button 
            size="icon" 
            onClick={handleSend}
            disabled={!text.trim() && !isGenerating}
            className={isGenerating ? "bg-red-500 hover:bg-red-600" : ""}
          >
            {isGenerating ? <StopCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
