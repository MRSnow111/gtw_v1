"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTable } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { cn } from "@/lib/utils";
import {
  Users,
  Clock,
  Activity,
  Server,
  ShieldAlert,
  History,
  Radio,
} from "lucide-react";

interface DashboardData {
  users: { total: number; admins: number; new7d: number };
  sessions: {
    active: number;
    total: number;
    recent: { login: string; role: string; startedAt: string; lastSeen: string; active: boolean }[];
  };
  gateway: { reachable: boolean; address: string };
  server: { uptimeSec: number; node: string };
  security: { failedLogins24h: number };
  events: { ts: string; kind: string; login: string; detail: string }[];
}

const EVENT_LABELS: Record<string, string> = {
  login_ok: "Вход",
  login_fail: "Неудачный вход",
  logout: "Выход",
  user_created: "Создан пользователь",
  user_deleted: "Удалён пользователь",
  file_saved: "Файл сохранён",
  file_deleted: "Файл удалён",
};

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec} с`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч ${min % 60} мин`;
  const d = Math.floor(h / 24);
  return `${d} дн ${h % 24} ч`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000); // живое обновление раз в 15 с
    return () => clearInterval(t);
  }, [load]);

  const cards = [
    {
      title: "Пользователи",
      subtitle: stats ? `Админов: ${stats.users.admins} · новых за 7 дн: ${stats.users.new7d}` : "Всего зарегистрировано",
      value: stats?.users.total ?? "—",
      icon: <Users className="h-4 w-4" />,
      gradient: "text-mint",
    },
    {
      title: "Активные сессии",
      subtitle: "Активность за 15 минут",
      value: stats?.sessions.active ?? "—",
      icon: <Clock className="h-4 w-4" />,
      gradient: "text-[#6BA3D6]",
    },
    {
      title: "Gateway",
      subtitle: stats?.gateway.address ?? "WS-адаптер агента",
      value: stats ? (stats.gateway.reachable ? "Доступен" : "Недоступен") : "—",
      icon: <Radio className="h-4 w-4" />,
      gradient: stats?.gateway.reachable ? "text-emerald-400/90" : "text-red-400/90",
    },
    {
      title: "Аптайм",
      subtitle: stats ? `Веб-сервер · Node ${stats.server.node}` : "Время работы",
      value: stats ? formatUptime(stats.server.uptimeSec) : "—",
      icon: <Server className="h-4 w-4" />,
      gradient: "text-emerald-400/90",
    },
    {
      title: "Неудачные входы",
      subtitle: "За 24 часа",
      value: stats?.security.failedLogins24h ?? "—",
      icon: <ShieldAlert className="h-4 w-4" />,
      gradient: (stats?.security.failedLogins24h ?? 0) > 0 ? "text-amber-400/90" : "text-mint-soft",
    },
    {
      title: "Всего сессий",
      subtitle: "Входов за всё время",
      value: stats?.sessions.total ?? "—",
      icon: <History className="h-4 w-4" />,
      gradient: "text-mint-soft",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">
          Дашборд
        </h1>
        <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
          Общая информация о системе — обновляется каждые 15 секунд
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <AdminCard
              title={card.title}
              subtitle={card.subtitle}
              icon={
                <div className="glass-medium flex h-9 w-9 items-center justify-center rounded-xl border border-mint/20">
                  <span className={card.gradient}>{card.icon}</span>
                </div>
              }
            >
              <div className="text-3xl font-bold text-[rgba(220,235,230,0.9)]">
                {loading ? (
                  <div className="h-9 w-16 rounded-lg bg-[rgba(143,184,174,0.1)] animate-pulse" />
                ) : (
                  card.value
                )}
              </div>
            </AdminCard>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <AdminCard
          title="Последние события"
          subtitle="Входы, изменения пользователей и файлов"
          icon={<Activity className="h-5 w-5" />}
          variant="light"
        >
          {loading ? (
            <div className="h-40 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
          ) : (
            <AdminTable
              columns={[
                { key: "ts", label: "Время", render: (v: string) => formatDate(v) },
                {
                  key: "kind",
                  label: "Событие",
                  render: (v: string) => (
                    <span className={v === "login_fail" ? "text-[#F0C040]" : "text-[rgba(220,235,230,0.85)]"}>
                      {EVENT_LABELS[v] ?? v}
                    </span>
                  ),
                },
                { key: "login", label: "Кто" },
                {
                  key: "detail",
                  label: "Подробности",
                  render: (v: string) => (
                    <span className="text-xs text-[rgba(165,187,179,0.6)]">{v || "—"}</span>
                  ),
                },
              ]}
              data={stats?.events ?? []}
              emptyMessage="Событий пока нет"
            />
          )}
        </AdminCard>

        <AdminCard
          title="Сессии"
          subtitle="Последние входы пользователей"
          icon={<Clock className="h-5 w-5" />}
          variant="light"
        >
          {loading ? (
            <div className="h-40 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
          ) : (
            <AdminTable
              columns={[
                { key: "login", label: "Логин", className: "px-2" },
                {
                  key: "role",
                  label: "Роль",
                  className: "px-2",
                  render: (v: string) => (
                    <span className={cn("text-xs whitespace-nowrap", v === "admin" ? "text-[#F0C040]" : "text-[rgba(220,235,230,0.6)]")}>
                      {v === "admin" ? "Админ" : "Юзер"}
                    </span>
                  ),
                },
                { key: "startedAt", label: "Вход", className: "px-2", render: (v: string) => <span className="text-xs whitespace-nowrap">{formatDate(v)}</span> },
                { key: "lastSeen", label: "Активность", className: "px-2", render: (v: string) => <span className="text-xs whitespace-nowrap">{formatDate(v)}</span> },
                {
                  key: "active",
                  label: "Статус",
                  className: "px-2",
                  render: (v: boolean) => <StatusBadge status={v ? "active" : "closed"} />,
                },
              ]}
              data={stats?.sessions.recent ?? []}
              emptyMessage="Сессий пока нет"
            />
          )}
        </AdminCard>
      </div>
    </div>
  );
}
