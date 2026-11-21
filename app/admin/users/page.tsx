"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { Users, Plus, Trash2 } from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [usage, setUsage] = useState<Record<string, { limit: number | null; used: number }>>({});
  const [limitEditing, setLimitEditing] = useState<string | null>(null);
  const [limitValue, setLimitValue] = useState("");

  const loadUsers = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  };
  const loadLimits = () => {
    fetch("/api/admin/limits")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, { limit: number | null; used: number }> = {};
        for (const u of d.users || []) map[u.login] = { limit: u.limit, used: u.used };
        setUsage(map);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadUsers();
    loadLimits();
  }, []);

  const openLimitEditor = (login: string) => {
    setLimitEditing(login);
    const cur = usage[login]?.limit;
    setLimitValue(cur ? String(cur) : "");
  };
  const saveLimit = async () => {
    if (!limitEditing) return;
    const n = limitValue.trim() === "" ? 0 : Number(limitValue);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      toast.error("Лимит — целое число токенов (пусто или 0 = без лимита)");
      return;
    }
    const res = await fetch("/api/admin/limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: limitEditing, tokenLimit: n }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      toast.success(n > 0 ? `Лимит для «${limitEditing}»: ${n.toLocaleString("ru-RU")} токенов` : `Лимит для «${limitEditing}» снят`);
      setLimitEditing(null);
      loadLimits();
    } else {
      toast.error(data?.message ?? "Не удалось сохранить лимит");
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      toast.success("Пользователь удалён");
      loadUsers();
    } else {
      toast.error(data?.message ?? "Не удалось удалить");
    }
  };

  const handleAdd = async () => {
    if (!newLogin || !newPassword) {
      toast.error("Заполните все поля");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: newLogin, password: newPassword, role: newRole }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      toast.success(`Пользователь «${newLogin}» создан — можно входить`);
      setAdding(false);
      setNewLogin("");
      setNewPassword("");
      setNewRole("user");
      loadUsers();
    } else {
      toast.error(data?.message ?? "Не удалось создать пользователя");
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso || iso === "—") return "—";
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Пользователи</h1>
          <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
            Управление учётными записями
          </p>
        </div>
        <GlassButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Добавить
        </GlassButton>
      </div>

      <AdminCard
        title="Сводка"
        icon={<Users className="h-5 w-5" />}
        variant="light"
      >
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-[rgba(165,187,179,0.5)]">Всего: </span>
            <span className="font-semibold text-[rgba(220,235,230,0.9)]">{users.length}</span>
          </div>
          <div>
            <span className="text-[rgba(165,187,179,0.5)]">Активных: </span>
            <span className="font-semibold text-[#75D6A8]">{users.filter((u) => u.isActive).length}</span>
          </div>
          <div>
            <span className="text-[rgba(165,187,179,0.5)]">Админов: </span>
            <span className="font-semibold text-[#F0C040]">{users.filter((u) => u.role === "admin").length}</span>
          </div>
        </div>
      </AdminCard>

      {loading ? (
        <div className="h-48 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
      ) : (
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
              render: (login: string) => {
                const u = usage[login];
                if (!u) return <span className="text-[rgba(165,187,179,0.3)] text-xs">—</span>;
                const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : null;
                return (
                  <div className="min-w-[110px]">
                    <span className="font-mono text-xs text-[rgba(220,235,230,0.85)]">
                      {u.used.toLocaleString("ru-RU")}
                      {u.limit ? <span className="text-[rgba(165,187,179,0.5)]"> / {u.limit.toLocaleString("ru-RU")}</span> : null}
                    </span>
                    {pct !== null && (
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? "bg-[rgba(220,112,112,0.8)]" : pct >= 80 ? "bg-[#F0C040]" : "bg-[#75D6A8]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              },
            },
            {
              key: "login",
              label: "Лимит",
              render: (login: string) => (
                <button
                  onClick={() => openLimitEditor(login)}
                  className="rounded-lg px-2 py-1 text-xs text-mint transition-colors hover:bg-[rgba(143,184,174,0.1)]"
                >
                  {usage[login]?.limit ? "Изменить" : "Задать"}
                </button>
              ),
            },
            { key: "lastLogin", label: "Последний вход", render: (v: string) => formatDate(v) },
            {
              key: "id",
              label: "Действия",
              render: (id: string, row: any) =>
                row.source !== "env" ? (
                  <button
                    onClick={() => handleDelete(id)}
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
      )}

      <AdminModal
        isOpen={adding}
        onClose={() => setAdding(false)}
        title="Новый пользователь"
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setAdding(false)}>Отмена</GlassButton>
            <GlassButton size="sm" onClick={handleAdd}>Создать</GlassButton>
          </>
        }
      >
        <GlassInput label="Логин" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
        <GlassInput label="Пароль" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <div className="space-y-2">
          <label className="text-sm font-medium text-[rgba(220,235,230,0.7)]">Роль</label>
          <div className="flex gap-2">
            <button
              onClick={() => setNewRole("user")}
              className={`flex-1 py-2 rounded-xl text-sm transition-all ${
                newRole === "user"
                  ? "bg-[rgba(143,184,174,0.2)] text-[rgba(220,235,230,0.9)]"
                  : "text-[rgba(165,187,179,0.5)] hover:bg-[rgba(143,184,174,0.08)]"
              }`}
            >
              Пользователь
            </button>
            <button
              onClick={() => setNewRole("admin")}
              className={`flex-1 py-2 rounded-xl text-sm transition-all ${
                newRole === "admin"
                  ? "bg-[rgba(240,192,64,0.2)] text-[rgba(240,192,64,0.9)]"
                  : "text-[rgba(165,187,179,0.5)] hover:bg-[rgba(143,184,174,0.08)]"
              }`}
            >
              Админ
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        isOpen={limitEditing !== null}
        onClose={() => setLimitEditing(null)}
        title={`Лимит токенов — ${limitEditing ?? ""}`}
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setLimitEditing(null)}>Отмена</GlassButton>
            <GlassButton size="sm" onClick={saveLimit}>Сохранить</GlassButton>
          </>
        }
      >
        <GlassInput
          label="Лимит токенов (пусто или 0 = без лимита)"
          type="number"
          value={limitValue}
          onChange={(e) => setLimitValue(e.target.value)}
          placeholder="например, 500000"
        />
        <p className="text-xs leading-relaxed text-[rgba(165,187,179,0.55)]">
          Учитывается сумма входных и выходных токенов по всем чатам пользователя.
          При достижении лимита новые сообщения блокируются шлюзом до изменения лимита.
          {usage[limitEditing ?? ""] ? (
            <> Сейчас использовано: <span className="text-[rgba(220,235,230,0.85)]">{usage[limitEditing ?? ""].used.toLocaleString("ru-RU")}</span>.</>
          ) : null}
        </p>
      </AdminModal>
    </div>
  );
}
