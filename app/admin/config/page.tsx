"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { AdminCard } from "@/components/admin/AdminCard";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { AdminModal } from "@/components/admin/AdminModal";
import { Settings, Plus, RefreshCw } from "lucide-react";

export default function AdminConfigPage() {
  const [config, setConfig] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then(setConfig)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (item: any) => {
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: item.key, value: item.value }),
    });
    if (res.ok) {
      toast.success("Настройка обновлена");
      setEditing(null);
    }
  };

  const handleAdd = async () => {
    if (!newKey || !newValue) {
      toast.error("Заполните все поля");
      return;
    }
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: newKey, value: newValue }),
    });
    if (res.ok) {
      toast.success("Настройка добавлена");
      setAdding(false);
      setNewKey("");
      setNewValue("");
      setConfig((prev) => [
        ...prev,
        { id: String(Date.now()), key: newKey, value: newValue, description: "", updatedAt: new Date().toISOString() },
      ]);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Настройки</h1>
          <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
            Управление конфигурацией gateway
          </p>
        </div>
        <GlassButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Добавить
        </GlassButton>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {config.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <AdminCard variant="light" className="!p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-[rgba(220,235,230,0.85)]">
                        {item.key}
                      </span>
                      <span className="text-xs text-[rgba(165,187,179,0.4)]">→</span>
                      <span className="font-mono text-sm text-[rgba(143,184,174,0.7)]">
                        {item.value}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-[rgba(165,187,179,0.5)] mt-1">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-[rgba(165,187,179,0.4)] whitespace-nowrap">
                      {formatDate(item.updatedAt)}
                    </span>
                    <GlassButton
                      size="sm"
                      variant="ghost"
                      icon={<RefreshCw className="h-3 w-3" />}
                      onClick={() => setEditing(item)}
                    >
                      Изменить
                    </GlassButton>
                  </div>
                </div>
              </AdminCard>
            </motion.div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      <AdminModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={`Редактирование: ${editing?.key}`}
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Отмена
            </GlassButton>
            <GlassButton size="sm" onClick={() => editing && handleSave(editing)}>
              Сохранить
            </GlassButton>
          </>
        }
      >
        <GlassInput
          label="Ключ"
          value={editing?.key || ""}
          onChange={(e) => setEditing({ ...editing, key: e.target.value })}
          disabled
        />
        <GlassInput
          label="Значение"
          value={editing?.value || ""}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
        />
      </AdminModal>

      {/* Add modal */}
      <AdminModal
        isOpen={adding}
        onClose={() => setAdding(false)}
        title="Новая настройка"
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Отмена
            </GlassButton>
            <GlassButton size="sm" onClick={handleAdd}>
              Добавить
            </GlassButton>
          </>
        }
      >
        <GlassInput label="Ключ" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <GlassInput label="Значение" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
      </AdminModal>
    </div>
  );
}
