"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminTable } from "@/components/admin/AdminTable";
import { GlassButton } from "@/components/ui/GlassButton";
import { Puzzle, RefreshCw } from "lucide-react";

export default function AdminPluginsPage() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/plugins")
      .then((r) => r.json())
      .then(setPlugins)
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (plugin: any) => {
    const res = await fetch(`/api/admin/plugins?id=${plugin.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !plugin.enabled }),
    });
    if (res.ok) {
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, enabled: !p.enabled } : p))
      );
      toast.success(plugin.enabled ? "Плагин отключён" : "Плагин включён");
    }
  };

  const categoryColors: Record<string, string> = {
    core: "text-[#75D6A8]",
    security: "text-[#E8605A]",
    utility: "text-[#6BA3D6]",
    monitoring: "text-[#F0C040]",
    storage: "text-[#B088D4]",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Плагины</h1>
        <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
          Управление расширениями gateway
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
          ))}
        </div>
      ) : (
        <AdminTable
          columns={[
            {
              key: "name",
              label: "Название",
              render: (val: string, row: any) => (
                <div>
                  <span className="font-medium text-[rgba(220,235,230,0.85)]">{val}</span>
                  <span className="ml-2 text-xs text-[rgba(165,187,179,0.4)]">v{row.version}</span>
                </div>
              ),
            },
            {
              key: "category",
              label: "Категория",
              render: (val: string) => (
                <span className={`text-xs ${categoryColors[val] || "text-[rgba(165,187,179,0.5)]"}`}>
                  {val}
                </span>
              ),
            },
            {
              key: "enabled",
              label: "Статус",
              render: (val: boolean) => <StatusBadge status={val ? "enabled" : "disabled"} />,
            },
            {
              key: "description",
              label: "Описание",
              render: (val: string) => (
                <span className="text-xs text-[rgba(165,187,179,0.5)] max-w-xs truncate block">
                  {val}
                </span>
              ),
            },
            {
              key: "id",
              label: "Действия",
              render: (id: string, row: any) => (
                <GlassButton
                  size="sm"
                  variant="ghost"
                  icon={<RefreshCw className="h-3 w-3" />}
                  onClick={() => handleToggle(row)}
                >
                  {row.enabled ? "Отключить" : "Включить"}
                </GlassButton>
              ),
            },
          ]}
          data={plugins}
          emptyMessage="Нет плагинов"
        />
      )}
    </div>
  );
}
