"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Settings,
  Search,
  MoreHorizontal,
  Code2,
  Server,
  BarChart3,
  Leaf,
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";

// TODO: список чатов с сервера (docs/design.md §5). Моки для отрисовки.
const MOCK_CHATS = [
  { id: "1", title: "Анализ отчёта", time: "12:40", group: "Сегодня", icon: BarChart3 },
  { id: "2", title: "Рефакторинг API", time: "Вчера", group: "На этой неделе", icon: Code2 },
  { id: "3", title: "Деплой на сервер", time: "Пн", group: "Ранее", icon: Server },
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
    <aside className="panel flex h-full flex-col">
      {/* logo header */}
      <div className="relative flex items-center justify-between px-5 pb-3 pt-5">
        <div className="flex items-center gap-2.5">
          <Leaf className="h-5 w-5 accent" strokeWidth={1.8} />
          <span className="text-lg font-semibold tracking-wide text-1">GTW</span>
        </div>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-2 transition-colors hover:border-white/25 hover:text-1"
          title="Тема (тёмная — единственная в v1)"
          disabled
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v18" />
            <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" opacity="0.5" />
          </svg>
        </button>
      </div>

      {/* new chat */}
      <div className="px-4 pb-3">
        <button
          onClick={() => {
            setActiveChat("new");
            router.push("/chat");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-2.5 text-sm text-1 transition-colors hover:bg-white/[0.10]"
        >
          <Plus className="h-4 w-4 accent" />
          Новый чат
        </button>
      </div>

      {/* search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-1 outline-none placeholder:text-3 focus:border-[rgba(110,231,168,0.35)]"
          />
        </div>
      </div>

      {/* chat list */}
      <div className="relative flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group}>
            <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-3">
              {group}
            </div>
            <div className="space-y-0.5">
              {chats
                .filter((c) => c.group === group)
                .map((chat) => {
                  const Icon = chat.icon;
                  const active = activeId === chat.id;
                  return (
                    <button
                      key={chat.id}
                      onClick={() => openChat(chat.id)}
                      className={
                        "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left transition-colors " +
                        (active
                          ? "bg-[rgba(110,231,168,0.10)]"
                          : "hover:bg-white/[0.05]")
                      }
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-[#6EE7A8] shadow-[0_0_10px_rgba(110,231,168,0.8)]" />
                      )}
                      <Icon className="h-4 w-4 shrink-0 text-2" strokeWidth={1.8} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-1">{chat.title}</span>
                        <span className="block text-xs text-3">{chat.time}</span>
                      </span>
                      <MoreHorizontal className="h-4 w-4 shrink-0 text-transparent transition-colors group-hover:text-3" />
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
        {chats.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-3">Ничего не найдено</div>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-4">
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-2 transition-colors hover:text-1"
        >
          <Settings className="h-4 w-4" strokeWidth={1.8} />
          Настройки
        </button>
        <button
          onClick={logout}
          title="Выйти"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-2 transition-colors hover:border-[rgba(220,80,80,0.4)] hover:text-[rgba(220,120,120,0.9)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
