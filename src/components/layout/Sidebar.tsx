"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Settings, Search, MoreHorizontal, Code2, Server, BarChart3, Leaf, LogOut, MessageSquare, SlidersHorizontal } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";

// Временные элементы списка до подключения серверной истории чатов.
const MOCK_CHATS = [
  { id: "1", title: "Анализ отчёта", preview: "Подготовил сводку по данным…", time: "12:40", group: "Сегодня", icon: BarChart3 },
  { id: "2", title: "Рефакторинг API", preview: "Проверим структуру эндпоинтов", time: "Вчера", group: "На этой неделе", icon: Code2 },
  { id: "3", title: "Деплой на сервер", preview: "Проверка конфигурации Docker", time: "Пн", group: "Ранее", icon: Server },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const activeId = pathname.match(/^\/chat\/([^/]+)/)?.[1];
  const chats = useMemo(() => MOCK_CHATS.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())), [query]);
  const groups = ["Сегодня", "На этой неделе", "Ранее"].filter((group) => chats.some((chat) => chat.group === group));

  const openChat = (id: string) => {
    setActiveChat(id);
    router.push(`/chat/${id}`);
  };

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.push("/"); }
  };

  return (
    <aside className="panel flex h-full min-h-0 flex-col">
      <div className="relative flex items-center justify-between px-5 pb-5 pt-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(143,184,174,.22)] bg-[rgba(143,184,174,.10)] shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_0_24px_rgba(94,151,133,.10)]">
            <Leaf className="h-[18px] w-[18px] text-[#A9CFC2]" strokeWidth={1.65} />
          </span>
          <span className="text-[17px] font-semibold tracking-[.16em] text-1">GTW</span>
          <span className="mt-0.5 rounded-full border border-white/[.08] bg-white/[.04] px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-3">BETA</span>
        </div>
        <button disabled title="Тёмная тема — единственная в v1" className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border border-white/[.09] bg-white/[.035] text-3 opacity-65">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3.5 pb-4">
        <button onClick={() => { setActiveChat("new"); router.push("/chat"); }} className="group flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[rgba(186,220,207,.18)] bg-[linear-gradient(135deg,rgba(143,184,174,.17),rgba(143,184,174,.07))] text-[13px] font-medium text-1 shadow-[inset_0_1px_0_rgba(255,255,255,.09)] transition-all duration-200 hover:border-[rgba(143,184,174,.36)] hover:bg-[rgba(143,184,174,.16)] hover:shadow-[0_0_26px_rgba(100,157,139,.10)]">
          <Plus className="h-4 w-4 text-[#A9CFC2] transition-transform group-hover:rotate-90" />
          Новый чат
        </button>
      </div>

      <div className="px-3.5 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-3" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск чатов" className="h-10 w-full rounded-full border border-white/[.085] bg-black/[.13] pl-10 pr-4 text-[12px] text-1 outline-none transition-colors placeholder:text-3 focus:border-[rgba(143,184,174,.32)] focus:bg-black/[.20]" />
        </div>
      </div>

      <div className="soft-scrollbar relative flex-1 space-y-5 overflow-y-auto px-2.5 py-3">
        {groups.map((group) => (
          <section key={group}>
            <div className="mb-2 flex items-center gap-2 px-3 text-[9px] font-semibold uppercase tracking-[.18em] text-3">
              <span>{group}</span><span className="h-px flex-1 bg-white/[.06]" />
            </div>
            <div className="space-y-1">
              {chats.filter((chat) => chat.group === group).map((chat) => {
                const Icon = chat.icon;
                const active = activeId === chat.id;
                return (
                  <button key={chat.id} onClick={() => openChat(chat.id)} className={`group relative flex w-full items-start gap-3 overflow-hidden rounded-[15px] px-3 py-3 text-left transition-all duration-200 ${active ? "border border-[rgba(143,184,174,.13)] bg-[rgba(143,184,174,.105)] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]" : "border border-transparent hover:border-white/[.055] hover:bg-white/[.035]"}`}>
                    {active && <span className="absolute bottom-3 left-0 top-3 w-[2px] rounded-r-full bg-[#9FC9B9] shadow-[0_0_12px_rgba(143,184,174,.8)]" />}
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? "bg-[rgba(143,184,174,.14)] text-[#B7D8CC]" : "bg-white/[.045] text-3"}`}><Icon className="h-3.5 w-3.5" strokeWidth={1.7} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[12px] font-medium ${active ? "text-1" : "text-[rgba(220,235,230,.82)]"}`}>{chat.title}</span>
                      <span className="mt-1 block truncate text-[10px] text-3">{chat.preview}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[9px] text-3">{chat.time}</span>
                      <MoreHorizontal className="h-3.5 w-3.5 text-transparent transition-colors group-hover:text-2" />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {chats.length === 0 && <div className="px-3 py-8 text-center"><MessageSquare className="mx-auto mb-2 h-5 w-5 text-3" /><p className="text-xs text-3">Ничего не найдено</p></div>}
      </div>

      <div className="border-t border-white/[.075] p-3">
        <button type="button" className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[12px] text-2 transition-colors hover:bg-white/[.045] hover:text-1">
          <Settings className="h-4 w-4" strokeWidth={1.7} />Настройки
          <span className="ml-auto text-[9px] text-3">⌘ ,</span>
        </button>
        <button onClick={logout} className="mt-1 flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[12px] text-2 transition-colors hover:bg-[rgba(220,112,112,.08)] hover:text-[#E6A2A2]">
          <LogOut className="h-4 w-4" strokeWidth={1.7} />Выйти
        </button>
        <div className="mt-2 flex items-center gap-2 px-3 pb-1 pt-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#75D6A8] shadow-[0_0_8px_rgba(117,214,168,.7)]" />
          <span className="text-[9px] tracking-wide text-3">GTW WORKSPACE</span>
          <span className="ml-auto text-[9px] text-3">v1.0</span>
        </div>
      </div>
    </aside>
  );
}
