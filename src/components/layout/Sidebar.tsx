"use client";

import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Settings } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";

export function Sidebar() {
  const { setActiveChat } = useChatStore();

  return (
    <aside className="w-64 border-r bg-card flex flex-col h-full">
      <div className="p-4 border-b">
        <Button className="w-full justify-start" onClick={() => setActiveChat(null)}>
          <Plus className="mr-2 h-4 w-4" />
          Новый чат
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="text-sm font-medium text-muted-foreground mb-2 px-2">Чаты</div>
        {/* Placeholder for chat list */}
        <div className="space-y-1">
          <button
            className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
            onClick={() => setActiveChat("1")}
          >
            <MessageSquare className="inline-block mr-2 h-4 w-4" />
            Анализ отчета
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
            onClick={() => setActiveChat("2")}
          >
            <MessageSquare className="inline-block mr-2 h-4 w-4" />
            Идеи для проекта
          </button>
        </div>
      </div>

      <div className="p-4 border-t">
        <Button variant="ghost" className="w-full justify-start">
          <Settings className="mr-2 h-4 w-4" />
          Настройки
        </Button>
      </div>
    </aside>
  );
}
