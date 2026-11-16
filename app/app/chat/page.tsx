"use client";

import { Plus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chatStore";

export default function ChatListPage() {
  const { setActiveChat } = useChatStore();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-lg border bg-card p-8 shadow-sm">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Добро пожаловать</h2>
          <p className="text-muted-foreground mb-6">
            Выберите чат из боковой панели или создайте новый, чтобы начать общение с агентом.
          </p>
          <Button className="w-full" onClick={() => setActiveChat("new")}>
            <Plus className="mr-2 h-4 w-4" />
            Новый чат
          </Button>
        </div>
      </div>
    </div>
  );
}
