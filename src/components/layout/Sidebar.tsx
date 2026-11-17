"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GlassInput } from "@/components/ui/GlassInput";
import {
  Plus,
  MessageSquare,
  Settings,
  Search,
  LogOut,
  MoreHorizontal,
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";

// TODO: список чатов с сервера (docs/design.md §5). Пока моки для отрисовки группировки.
const MOCK_CHATS = [
  { id: "1", title: "Анализ отчёта", preview: "Итого по кварталу…", group: "Сегодня" },
  { id: "2", title: "Идеи для проекта", preview: "Можно попробовать…", group: "На этой неделе" },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  const activeId = pathname.match(/^\/chat\/(\w+)/)?.[1];
  const chats = MOCK_CHATS.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase())
  );
  const groups = [...new Set(chats.map((c) => c.group))];

  const openChat = (id: string) => {
    setActiveChat(id);
    router.push(`/chat/${id}`);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  return (
    <aside className="glass-medium flex h-full w-64 shrink-0 flex-col rounded-3xl m-3 mr-0">
      <div className="space-y-3 border-b border-[rgba(220,235,230,0.08)] p-4">
        <Button
          className="w-full justify-start rounded-full bg-gradient-to-r from-[#8FB8AE] to-[#4D7B73] text-[#0A1412] hover:from-[#9EC4BC] hover:to-[#5A8A80]"
          onClick={() => {
            setActiveChat("new");
            router.push("/chat");
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Новый чат
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(220,235,230,0.35)]" />
          <GlassInput
            placeholder="Поиск"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 py-2 pl-9 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group}>
            <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-[rgba(220,235,230,0.32)]">
              {group}
            </div>
            <div className="space-y-1">
              {chats
                .filter((c) => c.group === group)
                .map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => openChat(chat.id)}
                    className={
                      "group flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors " +
                      (activeId === chat.id
                        ? "bg-[rgba(143,184,174,0.13)]"
                        : "hover:bg-[rgba(143,184,174,0.08)]")
                    }
                  >
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[rgba(143,184,174,0.6)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-[rgba(220,235,230,0.85)]">
                        {chat.title}
                      </span>
                      <span className="block truncate text-xs text-[rgba(220,235,230,0.38)]">
                        {chat.preview}
                      </span>
                    </span>
                    <MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-[rgba(220,235,230,0.0)] transition-opacity group-hover:text-[rgba(220,235,230,0.4)]" />
                  </button>
                ))}
            </div>
          </div>
        ))}
        {chats.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-[rgba(220,235,230,0.35)]">
            Ничего не найдено
          </div>
        )}
      </div>

      <div className="space-y-1 border-t border-[rgba(220,235,230,0.08)] p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-[rgba(220,235,230,0.6)] hover:bg-[rgba(143,184,174,0.08)] hover:text-[rgba(220,235,230,0.9)]"
        >
          <Settings className="mr-2 h-4 w-4" />
          Настройки
        </Button>
        <Button
          variant="ghost"
          onClick={logout}
          className="w-full justify-start text-[rgba(220,235,230,0.45)] hover:bg-[rgba(220,80,80,0.10)] hover:text-[rgba(220,120,120,0.9)]"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Выйти
        </Button>
      </div>
    </aside>
  );
}
