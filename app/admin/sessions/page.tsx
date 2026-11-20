"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminTable } from "@/components/admin/AdminTable";
import { GlassButton } from "@/components/ui/GlassButton";
import { Clock, Power } from "lucide-react";

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "idle" | "closed">("all");

  useEffect(() => {
    fetch("/api/admin/sessions")
      .then((r) => r.json())
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  const handleClose = async (id: string) => {
    const res = await fetch(`/api/admin/sessions?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Сессия закрыта");
      setSessions((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const filtered = filter === "all" ? sessions : sessions.filter((s) => s.status === filter);
  const counts = {
    all: sessions.length,
    active: sessions.filter((s) => s.status === "active").length,
    idle: sessions.filter((s) => s.status === "idle").length,
    closed: sessions.filter((s) => s.status === "closed").length,
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filters: Array<{ key: typeof filter; label: string; count: number }> = [
    { key: "all", label: "Все", count: counts.all },
    { key: "active", label: "Активные", count: counts.active },
    { key: "idle", label: "Ожидание", count: counts.idle },
    { key: "closed", label: "Закрытые", count: counts.closed },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Сессии</h1>
        <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
          Управление активными сессиями
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs transition-all ${
              filter === f.key
                ? "bg-[rgba(143,184,174,0.2)] text-[rgba(220,235,230,0.9)]"
                : "text-[rgba(165,187,179,0.5)] hover:bg-[rgba(143,184,174,0.08)]"
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
      ) : (
        <AdminTable
          columns={[
            { key: "userLogin", label: "Пользователь" },
            {
              key: "status",
              label: "Статус",
              render: (val: string) => <StatusBadge status={val} />,
            },
            { key: "messageCount", label: "Сообщений", render: (v: number) => <span className="font-mono text-xs">{v}</span> },
            { key: "createdAt", label: "Создана", render: (v: string) => formatDate(v) },
            { key: "lastActivity", label: "Активность", render: (v: string) => formatDate(v) },
            {
              key: "id",
              label: "Действия",
              render: (id: string, row: any) =>
                row.status !== "closed" ? (
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    icon={<Power className="h-3 w-3" />}
                    onClick={() => handleClose(id)}
                  >
                    Закрыть
                  </GlassButton>
                ) : (
                  <span className="text-[rgba(165,187,179,0.3)] text-xs">—</span>
                ),
            },
          ]}
          data={filtered}
          emptyMessage="Нет сессий"
        />
      )}
    </div>
  );
}
