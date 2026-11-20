"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  Users,
  Clock,
  Puzzle,
  Activity,
  Settings,
  Server,
} from "lucide-react";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 8600) / 3600);
  return `${days}д ${hours}ч`;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/health")
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const cards = [
    {
      title: "Пользователи",
      subtitle: "Всего зарегистрировано",
      value: stats?.totalUsers ?? "—",
      icon: <Users className="h-5 w-5" />,
      gradient: "from-[#75D6A8] to-[#4CAF80]",
    },
    {
      title: "Активные сессии",
      subtitle: "Сейчас онлайн",
      value: stats?.activeSessions ?? "—",
      icon: <Clock className="h-5 w-5" />,
      gradient: "from-[#6BA3D6] to-[#4A8BC2]",
    },
    {
      title: "Плагины",
      subtitle: "Включено",
      value: stats?.activePlugins ?? "—",
      icon: <Puzzle className="h-5 w-5" />,
      gradient: "from-[#F0C040] to-[#D4A520]",
    },
    {
      title: "Ошибки",
      subtitle: "Процент ошибок",
      value: stats ? `${stats.errorRate}%` : "—",
      icon: <Activity className="h-5 w-5" />,
      gradient: "from-[#E8605A] to-[#C84842]",
    },
    {
      title: "Изменения конфига",
      subtitle: "За всё время",
      value: stats?.configChanges ?? "—",
      icon: <Settings className="h-5 w-5" />,
      gradient: "from-[#B088D4] to-[#8A66B0]",
    },
    {
      title: "Аптайм",
      subtitle: "Время работы",
      value: stats?.uptime ?? "—",
      icon: <Server className="h-5 w-5" />,
      gradient: "from-[#8FB8AE] to-[#6E9C90]",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">
          Дашборд
        </h1>
        <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
          Общая информация о системе
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
                <div className={`p-2 rounded-xl bg-gradient-to-br ${card.gradient}`}>
                  {card.icon}
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

      {/* Live-reload indicator */}
      <AdminCard variant="light" title="Live-reload настроек" subtitle="Автоматическая перезагрузка конфигурации">
        <div className="flex items-center gap-3">
          <StatusBadge status="active" />
          <span className="text-xs text-[rgba(165,187,179,0.6)]">
            Настройки обновляются без перезапуска gateway
          </span>
        </div>
      </AdminCard>
    </div>
  );
}
