"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNowStrict } from "date-fns";
import { ru } from "date-fns/locale";
import {
  BarChart3, ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus,
  LogOut, MessageSquare, MoreHorizontal, Pencil, Plus, Search, Settings,
  Shield, SquareTerminal, Trash2, X, Archive,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useAgentStore } from "@/stores/agentStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { groupChats, type DemoChat, type Project } from "@/lib/demoData";
import { IconButton, GlassBadge } from "@/components/ui/glass";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const kindIcon = {
  chat: MessageSquare,
  terminal: SquareTerminal,
  data: BarChart3,
} as const;

const kindTint = {
  chat: "text-mint",
  terminal: "text-aqua",
  data: "text-lagoon",
} as const;

interface SidebarProps {
  className?: string;
  /** внутри мобильного drawer не рендерим элементы, требующие закрытия шторки иначе */
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const router = useRouter();
  const { chats, turnsByChat, activeChatId, setActiveChat, renameChat, deleteChat, createChat } = useAgentStore();
  const {
    projects, loadProjects, createProject, renameProject, setArchived,
    deleteProject, moveChat,
  } = useProjectStore();
  const { setSettingsOpen, setDrawerOpen } = useUiStore();
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");

  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DemoChat | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  // проекты
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const projectEditRef = useRef<HTMLInputElement>(null);
  const newProjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const runningIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [chatId, turns] of Object.entries(turnsByChat)) {
      const last = turns[turns.length - 1];
      if (last?.kind === "agent" && last.agentState === "running") ids.add(chatId);
    }
    return ids;
  }, [turnsByChat]);

  const fmtTime = (iso: string) =>
    formatDistanceToNowStrict(new Date(iso), { addSuffix: false, locale: ru }).replace("секунд", "с").replace("секунды", "с").replace("минут", "мин").replace("минуты", "мин").replace("час", "ч").replace("часа", "ч").replace("часов", "ч") + " назад";

  const q = query.trim().toLowerCase();
  const matchChat = (c: DemoChat) => !q || c.title.toLowerCase().includes(q);
  const activeProjects = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const activeIds = useMemo(() => new Set(activeProjects.map((p) => p.id)), [activeProjects]);
  const projectChats = (pid: string) =>
    chats
      .filter((c) => c.projectId === pid && matchChat(c))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const groups = useMemo(
    () => groupChats(chats.filter((c) => (!c.projectId || !activeIds.has(c.projectId)) && matchChat(c))),
    [chats, q, activeIds]
  );

  const openChat = (id: string) => {
    setActiveChat(id);
    setDrawerOpen(false);
    onNavigate?.();
    router.push(`/chat/${id}`);
  };

  const newChat = () => {
    setActiveChat(null);
    setDrawerOpen(false);
    onNavigate?.();
    router.push("/chat");
  };

  const newChatInProject = (pid: string) => {
    const chat = createChat(pid);
    setExpanded((e) => ({ ...e, [pid]: true }));
    openChat(chat.id);
  };

  const startRename = (c: DemoChat) => {
    setMenuId(null);
    setEditingId(c.id);
    setTimeout(() => editRef.current?.select(), 30);
  };

  const commitRename = () => {
    if (editingId && editRef.current) {
      const title = editRef.current.value.trim();
      if (title) {
        renameChat(editingId, title);
        toast.success("Чат переименован");
      }
    }
    setEditingId(null);
  };

  const commitProjectRename = () => {
    if (editingProjectId && projectEditRef.current) {
      const name = projectEditRef.current.value.trim();
      if (name) {
        renameProject(editingProjectId, name);
        toast.success("Проект переименован");
      }
    }
    setEditingProjectId(null);
  };

  const submitNewProject = async () => {
    const name = newProjectRef.current?.value.trim();
    if (name) {
      const p = await createProject(name);
      if (p) {
        setExpanded((e) => ({ ...e, [p.id]: true }));
        toast.success("Проект создан");
      }
    }
    setCreatingProject(false);
  };

  const doLogout = () => {
    logout();
    setDrawerOpen(false);
    router.push("/");
  };

  const closeMenus = () => {
    setMenuId(null);
    setMoveMenuId(null);
    setProjectMenuId(null);
  };

  /** строка чата — используется и внутри проектов, и в общих группах */
  const renderChat = (chat: DemoChat) => {
    const Icon = kindIcon[chat.kind] ?? MessageSquare;
    const active = chat.id === activeChatId;
    return (
      <div
        key={chat.id}
        className={cn(
          "group relative mb-0.5 rounded-xl transition-colors duration-200",
          active
            ? "bg-mint/18 shadow-[inset_0_0_0_1px_rgba(143,184,174,0.35),0_0_20px_rgba(143,184,174,0.08)]"
            : "hover:bg-white/[0.055]"
        )}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-[calc(100%-12px)] w-[3px] -translate-y-1/2 rounded-full bg-mint shadow-[0_0_10px_rgba(143,184,174,0.7)]" />
        )}
        <button
          onClick={() => openChat(chat.id)}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              active ? kindTint[chat.kind] : "text-[rgba(220,235,230,0.7)]"
            )}
          />
          {editingId === chat.id ? (
            <input
              ref={editRef}
              defaultValue={chat.title}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              onBlur={commitRename}
              className="w-full min-w-0 rounded bg-fern-950/60 px-1.5 py-0.5 text-[13px] outline-none ring-1 ring-mint/40"
              autoFocus
            />
          ) : (
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate text-[13px] leading-5",
                  active ? "text-foreground" : "text-dim"
                )}
              >
                {chat.title}
              </div>
            </div>
          )}
          {editingId !== chat.id && (
            <span className="shrink-0 text-[11px] tabular-nums text-[rgba(220,235,230,0.6)] transition-opacity group-hover:opacity-0">
              {runningIds.has(chat.id) ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-mint border-t-transparent align-[-2px]" />
              ) : (
                fmtTime(chat.updatedAt)
              )}
            </span>
          )}
        </button>
        {editingId !== chat.id && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMoveMenuId(null);
              setProjectMenuId(null);
              setMenuId(menuId === chat.id ? null : chat.id);
            }}
            className={cn(
              "absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[rgba(220,235,230,0.7)] opacity-0 transition-all hover:bg-white/10 hover:text-foreground group-hover:opacity-100",
              menuId === chat.id && "opacity-100"
            )}
            aria-label="Действия с чатом"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        <AnimatePresence>
          {menuId === chat.id && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeMenus} />
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="glass-medium absolute right-1 top-10 z-50 w-44 rounded-2xl p-1.5"
              >
                {moveMenuId === chat.id ? (
                  <>
                    <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-[0.12em] text-[rgba(220,235,230,0.6)]">
                      Переместить в
                    </div>
                    <button
                      onClick={() => { moveChat(chat.id, null); closeMenus(); toast.success("Чат вне проекта"); }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-dim hover:bg-white/[0.06] hover:text-foreground"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Без проекта
                    </button>
                    {activeProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { moveChat(chat.id, p.id); closeMenus(); toast.success(`Чат в «${p.name}»`); }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-dim hover:bg-white/[0.06] hover:text-foreground"
                      >
                        <Folder className="h-3.5 w-3.5 text-mint" /> <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startRename(chat)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-dim hover:bg-white/[0.06] hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Переименовать
                    </button>
                    <button
                      onClick={() => setMoveMenuId(chat.id)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-dim hover:bg-white/[0.06] hover:text-foreground"
                    >
                      <Folder className="h-3.5 w-3.5" /> В проект…
                    </button>
                    <button
                      onClick={() => {
                        setMenuId(null);
                        setDeleting(chat);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-red-300/90 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Удалить
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const nothingFound = groups.length === 0 && activeProjects.every((p) => projectChats(p.id).length === 0);

  return (
    <div className={cn("glass-strong relative flex h-full flex-col overflow-hidden", className)}>
      {/* ── шапка ── */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="glass-medium flex h-10 w-10 items-center justify-center rounded-xl border-mint/25 shadow-[0_0_18px_rgba(94,208,174,0.2)]">
          <span className="text-gradient-brand font-mono text-sm font-semibold tracking-widest">G</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium tracking-wide text-mint-soft">GTW</div>
          <div className="text-[11px] text-[rgba(220,235,230,0.6)]">шлюз к агенту Hermes</div>
        </div>
        {onNavigate && (
          <IconButton className="md:hidden" onClick={onNavigate} aria-label="Закрыть меню">
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      {/* ── новый чат ── */}
      <div className="px-4 pb-3">
        <motion.button
          whileHover={{ boxShadow: "0 0 24px rgba(143,184,174,0.25)" }}
          whileTap={{ scale: 0.98 }}
          onClick={newChat}
          className="glass-medium flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm text-foreground transition-colors hover:border-mint/40"
        >
          <Plus className="h-4 w-4 text-mint" />
          Новый чат
        </motion.button>
      </div>

      {/* ── поиск ── */}
      <div className="px-4 pb-3">
        <div className="glass-light relative rounded-full">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgba(220,235,230,0.6)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по чатам…"
            className="w-full bg-transparent py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-[rgba(220,235,230,0.52)]"
          />
        </div>
      </div>

      {/* ── список: проекты + чаты ── */}
      <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        {/* проекты */}
        <div className="mb-1 flex items-center justify-between px-2.5 pb-1 pt-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[rgba(220,235,230,0.6)]">Проекты</span>
          <button
            onClick={() => { setCreatingProject(true); setTimeout(() => newProjectRef.current?.focus(), 30); }}
            className="flex h-5 w-5 items-center justify-center rounded-md text-[rgba(220,235,230,0.7)] transition-colors hover:bg-white/10 hover:text-mint"
            aria-label="Создать проект"
            title="Создать проект"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>

        {creatingProject && (
          <div className="mb-1 px-1">
            <input
              ref={newProjectRef}
              placeholder="Название проекта…"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewProject();
                if (e.key === "Escape") setCreatingProject(false);
              }}
              onBlur={submitNewProject}
              className="w-full rounded-xl bg-fern-950/60 px-3 py-2 text-[13px] outline-none ring-1 ring-mint/40 placeholder:text-[rgba(220,235,230,0.5)]"
              autoFocus
            />
          </div>
        )}

        {activeProjects.map((p) => {
          const list = projectChats(p.id);
          if (q && list.length === 0) return null;
          const isOpen = expanded[p.id] || !!q;
          return (
            <div key={p.id} className="mb-1">
              <div className="group relative flex items-center gap-1 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-white/[0.05]">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-label={isOpen ? "Свернуть проект" : "Развернуть проект"}
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[rgba(220,235,230,0.6)]" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[rgba(220,235,230,0.6)]" />}
                  {isOpen ? <FolderOpen className="h-4 w-4 shrink-0 text-mint" /> : <Folder className="h-4 w-4 shrink-0 text-mint/80" />}
                  {editingProjectId === p.id ? (
                    <input
                      ref={projectEditRef}
                      defaultValue={p.name}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitProjectRename();
                        if (e.key === "Escape") setEditingProjectId(null);
                      }}
                      onBlur={commitProjectRename}
                      className="w-full min-w-0 rounded bg-fern-950/60 px-1.5 py-0.5 text-[13px] outline-none ring-1 ring-mint/40"
                      autoFocus
                    />
                  ) : (
                    <span className="truncate text-[13px] text-foreground">{p.name}</span>
                  )}
                  <span className="shrink-0 text-[11px] tabular-nums text-[rgba(220,235,230,0.5)]">{list.length}</span>
                </button>
                {editingProjectId !== p.id && (
                  <>
                    <button
                      onClick={() => newChatInProject(p.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[rgba(220,235,230,0.7)] opacity-0 transition-all hover:bg-white/10 hover:text-mint group-hover:opacity-100"
                      aria-label="Новый чат в проекте"
                      title="Новый чат в проекте"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId(null);
                        setMoveMenuId(null);
                        setProjectMenuId(projectMenuId === p.id ? null : p.id);
                      }}
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[rgba(220,235,230,0.7)] opacity-0 transition-all hover:bg-white/10 hover:text-foreground group-hover:opacity-100",
                        projectMenuId === p.id && "opacity-100"
                      )}
                      aria-label="Действия с проектом"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </>
                )}
                <AnimatePresence>
                  {projectMenuId === p.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeMenus} />
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="glass-medium absolute right-1 top-9 z-50 w-44 rounded-2xl p-1.5"
                      >
                        <button
                          onClick={() => { setProjectMenuId(null); setEditingProjectId(p.id); setTimeout(() => projectEditRef.current?.select(), 30); }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-dim hover:bg-white/[0.06] hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Переименовать
                        </button>
                        <button
                          onClick={() => { setProjectMenuId(null); setArchived(p.id, true); toast.success("Проект в архиве"); }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-dim hover:bg-white/[0.06] hover:text-foreground"
                        >
                          <Archive className="h-3.5 w-3.5" /> В архив
                        </button>
                        <button
                          onClick={() => { setProjectMenuId(null); setDeletingProject(p); }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-red-300/90 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Удалить
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden pl-3"
                  >
                    {list.length === 0 && (
                      <p className="px-3 py-1.5 text-[11px] text-[rgba(220,235,230,0.5)]">Пока нет чатов</p>
                    )}
                    {list.map(renderChat)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* чаты без проекта */}
        {nothingFound && (
          <p className="mt-8 text-center text-xs text-[rgba(220,235,230,0.6)]">
            Ничего не найдено
          </p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <div className="px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-[0.12em] text-[rgba(220,235,230,0.6)]">
              {group.label}
            </div>
            <AnimatePresence initial={false}>
              {group.chats.map(renderChat)}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* ── админ-панель (только для роли admin) ── */}
      {isAdmin && (
        <div className="px-4 pb-2">
          <Link
            href="/admin"
            onClick={() => setDrawerOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-dim transition-colors hover:bg-white/[0.05] hover:text-foreground"
          >
            <Shield className="h-4 w-4" />
            Админ-панель
          </Link>
        </div>
      )}

      {/* ── футер ── */}
      <div className="flex items-center gap-2 border-t border-white/[0.08] px-4 py-3">
        <button
          onClick={() => {
            setSettingsOpen(true);
            setDrawerOpen(false);
          }}
          className="flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-dim transition-colors hover:bg-white/[0.05] hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Настройки
        </button>
        <GlassBadge className="text-[10px]">demo</GlassBadge>
        <IconButton onClick={doLogout} aria-label="Выйти" title="Выйти">
          <LogOut className="h-4 w-4" />
        </IconButton>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Удалить «${deleting.title}»?` : ""}
        description="Чат и его история будут удалены безвозвратно."
        confirmLabel="Удалить"
        onConfirm={() => {
          if (deleting) {
            deleteChat(deleting.id);
            toast.success("Чат удалён");
            if (deleting.id === activeChatId) router.push("/chat");
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={!!deletingProject}
        title={deletingProject ? `Удалить проект «${deletingProject.name}»?` : ""}
        description="Чаты и файлы проекта сохранятся, но будут отвязаны от него."
        confirmLabel="Удалить"
        onConfirm={() => {
          if (deletingProject) {
            deleteProject(deletingProject.id);
            toast.success("Проект удалён");
          }
          setDeletingProject(null);
        }}
        onCancel={() => setDeletingProject(null)}
      />
    </div>
  );
}
