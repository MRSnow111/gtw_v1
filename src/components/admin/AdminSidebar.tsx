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

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[240px] shrink-0 rounded-[24px] glass-strong p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 px-3 py-3 mb-2">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#8FB8AE] to-[#4D7B73] flex items-center justify-center">
          <span className="text-xs font-bold text-[#0A1412]">GTW</span>
        </div>
        <span className="text-sm font-semibold text-[rgba(220,235,230,0.9)]">Admin</span>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150",
                isActive
                  ? "bg-[rgba(143,184,174,0.18)] text-[rgba(220,235,230,0.95)]"
                  : "text-[rgba(165,187,179,0.65)] hover:text-[rgba(220,235,230,0.85)] hover:bg-[rgba(143,184,174,0.08)]",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-2 pt-3 border-t border-[rgba(220,235,230,0.08)]">
        <Link
          href="/chat"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[rgba(165,187,179,0.5)] hover:text-[rgba(220,235,230,0.7)] hover:bg-[rgba(143,184,174,0.06)] transition-all"
        >
          ← Вернуться в чат
        </Link>
      </div>
    </aside>
  );
}
