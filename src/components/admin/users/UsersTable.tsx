"use client";

/**
 * Таблица пользователей (волна 5, D1) — колонки вынесены из page.tsx без
 * изменений заголовков, классов и текстов (UI-контракты e2e-тестов админки).
 */
import { CalendarClock, RotateCcw, Trash2 } from "lucide-react";
import { AdminTable } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { AdminUser, LimitInfo } from "./types";
import { formatDate, resetLabel } from "./format";
import { UsageCell } from "./UsageCell";

export interface UsersTableHandlers {
  onOpenLimit: (login: string, current: number | null) => void;
  onResetUsage: (login: string) => void;
  onOpenReset: (login: string, current?: LimitInfo) => void;
  onOpenModels: (login: string, current: string[] | null) => void;
  onDelete: (id: string) => void;
}

export function UsersTable({
  users,
  loading,
  usage,
  modelsMap,
  handlers,
}: {
  users: AdminUser[];
  loading: boolean;
  usage: Record<string, LimitInfo>;
  modelsMap: Record<string, string[] | null>;
  handlers: UsersTableHandlers;
}) {
  if (loading) {
    return <div className="h-48 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />;
  }

  return (
    <AdminTable
      columns={[
        { key: "login", label: "Логин" },
        {
          key: "role",
          label: "Роль",
          render: (val: string) => (
            <span className={val === "admin" ? "text-[#F0C040]" : "text-[rgba(220,235,230,0.6)]"}>
              {val === "admin" ? "Админ" : "Пользователь"}
            </span>
          ),
        },
        {
          key: "isActive",
          label: "Статус",
          render: (val: boolean) => <StatusBadge status={val ? "active" : "closed"} />,
        },
        {
          key: "login",
          label: "Токены",
          render: (login: string) => <UsageCell info={usage[login]} />,
        },
        {
          key: "login",
          label: "Лимит",
          render: (login: string) => (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlers.onOpenLimit(login, usage[login]?.limit ?? null)}
                className="rounded-lg px-2 py-1 text-xs text-mint transition-colors hover:bg-[rgba(143,184,174,0.1)]"
              >
                {usage[login]?.limit ? "Изменить" : "Задать"}
              </button>
              <button
                onClick={() => handlers.onResetUsage(login)}
                title="Обнулить израсходованные токены (лимит сохраняется)"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[rgba(240,192,64,0.85)] transition-colors hover:bg-[rgba(240,192,64,0.12)]"
              >
                <RotateCcw className="h-3 w-3" />
                Сброс
              </button>
            </div>
          ),
        },
        {
          key: "login",
          label: "Авто-сброс",
          render: (login: string) => {
            const mode = usage[login]?.resetMode ?? "off";
            return (
              <button
                onClick={() => handlers.onOpenReset(login, usage[login])}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-[rgba(143,184,174,0.1)]"
              >
                <CalendarClock className="h-3.5 w-3.5 text-mint" />
                <span className={mode === "off" ? "text-[rgba(165,187,179,0.6)]" : "text-mint"}>{resetLabel(usage[login])}</span>
              </button>
            );
          },
        },
        {
          key: "login",
          label: "Модели",
          render: (login: string) => {
            const list = modelsMap[login];
            return (
              <button
                onClick={() => handlers.onOpenModels(login, list ?? null)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-[rgba(143,184,174,0.1)]"
              >
                <span className={list == null ? "text-[rgba(165,187,179,0.6)]" : "text-mint"}>
                  {list == null ? "Все" : list.length}
                </span>
                <span className="text-mint">{list == null ? "Настроить" : "Изменить"}</span>
              </button>
            );
          },
        },
        { key: "lastLogin", label: "Последний вход", render: (v: string) => formatDate(v) },
        {
          key: "id",
          label: "Действия",
          render: (id: string, row: AdminUser) =>
            row.source !== "env" ? (
              <button
                onClick={() => handlers.onDelete(id)}
                className="text-[rgba(220,112,112,0.6)] hover:text-[rgba(220,112,112,0.9)] transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <span className="text-[rgba(165,187,179,0.3)] text-xs">—</span>
            ),
        },
      ]}
      data={users}
      emptyMessage="Нет пользователей"
    />
  );
}
