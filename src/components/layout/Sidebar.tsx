"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Code2,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Server,
  Settings,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { chatGroup, formatChatTime, type ChatGroup } from "@/lib/format";
import { MOCK_CHATS } from "@/lib/mockChats";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";

const ICONS: Record<string, LucideIcon> = {
  code: Code2,
  server: Server,
  python: MessageSquare,
  chart: BarChart3,
};

const GROUP_ORDER: ChatGroup[] = ["Сегодня", "Вчера", "На этой неделе", "Ранее"];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : true;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Переключить тему"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="glass-inner relative flex h-8 w-[3.75rem] items-center rounded-full px-1"
    >
      <Moon className="absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <Sun className="absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
      <span
        className={cn(
          "relative z-10 h-6 w-6 rounded-full bg-primary shadow-[0_0_14px_hsl(var(--primary)/0.6)] transition-transform duration-300",
          dark ? "translate-x-0" : "translate-x-[1.7rem]"
        )}
      />
    </button>
  );
}

export function Sidebar() {
  const { activeChatId, setActiveChat } = useChatStore();
  const { sidebarOpen, setSidebarOpen, setDraft } = useUiStore();
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = MOCK_CHATS.filter((c) => !q || c.title.toLowerCase().includes(q));
    return GROUP_ORDER.map((g) => ({
      name: g,
      items: items.filter((c) => chatGroup(c.updatedAt) === g),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const open = (id: string | null) => {
    setActiveChat(id);
    if (id === null) setDraft("");
    setSidebarOpen(false);
  };

  return (
    <>
      {/* затемнение под мобильным drawer */}
      <div
        onClick={() => setSidebarOpen(false)}
        className={cn(
          "fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        className={cn(
          "glass z-40 flex flex-col rounded-[1.75rem] p-4 transition-transform duration-300",
          // мобильный: drawer; md+: обычная колонка
          "fixed inset-y-3 left-3 w-[17.5rem] md:static md:inset-auto md:h-full md:w-64 md:shrink-0 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-[120%]"
        )}
      >
        <div className="flex items-center justify-between px-1 pb-4 pt-1">
          <Logo />
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setSidebarOpen(false)}
            className="glass-inner flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => open(null)}
          className="btn-glow flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          Новый чат
        </button>

        <label className="glass-inner mt-3 flex h-10 items-center gap-2 rounded-xl px-3 text-muted-foreground focus-within:border-primary/50">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по чатам"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <nav className="scroll-thin -mx-1 mt-3 flex-1 overflow-y-auto px-1">
          {MOCK_CHATS.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Пока нет чатов</p>
          )}
          {groups.length === 0 && MOCK_CHATS.length > 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Ничего не найдено</p>
          )}
          {groups.map((group) => (
            <div key={group.name} className="mb-2">
              <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {group.name}
              </div>
              <ul className="space-y-1">
                {group.items.map((chat) => {
                  const Icon = ICONS[chat.icon] ?? MessageSquare;
                  const active = activeChatId === chat.id;
                  return (
                    <li key={chat.id}>
                      <button
                        type="button"
                        onClick={() => open(chat.id)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                          active
                            ? "bg-primary/15 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]"
                            : "hover:bg-foreground/[0.06]"
                        )}
                      >
                        {active && (
                          <span className="absolute -left-1 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
                        )}
                        <Icon
                          className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground")}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{chat.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {mounted ? formatChatTime(chat.updatedAt) : "\u00a0"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Settings className="h-[18px] w-[18px]" />
            Настройки
          </button>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
