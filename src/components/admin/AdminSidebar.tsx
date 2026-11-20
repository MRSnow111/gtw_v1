"use client";

import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Settings,
  Users,
  Puzzle,
  Clock,
  FolderOpen,
  FileText,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: "/admin", label: "Дашборд", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/admin/config", label: "Настройки", icon: <Settings className="h-4 w-4" /> },
  { href: "/admin/users", label: "Пользователи", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/plugins", label: "Плагины", icon: <Puzzle className="h-4 w-4" /> },
  { href: "/admin/sessions", label: "Сессии", icon: <Clock className="h-4 w-4" /> },
  { href: "/admin/files", label: "Файлы", icon: <FolderOpen className="h-4 w-4" /> },
  { href: "/admin/logs", label: "Логи", icon: <FileText className="h-4 w-4" /> },
];

function isActive(pathname: string | null, href: string) {
  return pathname === href || (href !== "/admin" && !!pathname?.startsWith(href));
}

/**
 * Навигация админки в стиле основного Sidebar:
 * desktop — плавающая стеклянная панель, mobile — горизонтальные чипы.
 */
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* desktop */}
      <aside className="glass-strong glass-edge hidden w-[260px] shrink-0 flex-col overflow-hidden rounded-[28px] md:flex">
        {/* шапка — как в основном сайдбаре */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <div className="glass-medium flex h-10 w-10 items-center justify-center rounded-xl border-mint/25 shadow-[0_0_18px_rgba(94,208,174,0.2)]">
            <span className="text-gradient-brand font-mono text-sm font-semibold tracking-widest">G</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium tracking-wide text-mint-soft">GTW Admin</div>
            <div className="text-[11px] text-[rgba(220,235,230,0.6)]">панель управления</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto scroll-area px-3 py-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition-colors",
                isActive(pathname, item.href)
                  ? "bg-mint/15 text-foreground"
                  : "text-dim hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              <span className={cn(isActive(pathname, item.href) ? "text-mint" : "text-dim")}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/[0.08] px-3 py-3">
          <Link
            href="/chat"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-dim transition-colors hover:bg-white/[0.05] hover:text-foreground"
          >
            <MessageSquare className="h-4 w-4" />
            Вернуться в чат
          </Link>
        </div>
      </aside>

      {/* mobile — горизонтальные чипы */}
      <div className="flex shrink-0 gap-2 overflow-x-auto scroll-area pb-1 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "glass-light flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
              isActive(pathname, item.href)
                ? "border-mint/40 text-foreground"
                : "text-dim hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        <Link
          href="/chat"
          className="glass-light flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-dim transition-colors hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Чат
        </Link>
      </div>
    </>
  );
}
