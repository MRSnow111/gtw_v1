"use client";

import { Plus, MessageSquare } from "lucide-react";
import { GlassButton } from "@/components/ui/GlassButton";
import { useChatStore } from "@/stores/chatStore";

export default function ChatListPage() {
  const { setActiveChat } = useChatStore();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-full max-w-md space-y-4">
        <div className="glass-strong rounded-2xl p-8 text-center glass-hover">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl glass-light mb-4">
            <MessageSquare className="h-6 w-6 text-[rgba(143,184,174,0.6)]" />
          </div>
          <h2 className="text-xl font-semibold text-[rgba(220,235,230,0.85)] mb-2">
            Добро пожаловать
          </h2>
          <p className="text-sm text-[rgba(220,235,230,0.42)] mb-6">
            Выберите чат из боковой панели или создайте новый
          </p>
          <GlassButton
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => setActiveChat("new")}
            icon={<Plus className="h-4 w-4" />}
          >
            Новый чат
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
