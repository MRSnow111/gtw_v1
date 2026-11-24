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
import { Users, Plus, Trash2, Check, RotateCcw, CalendarClock } from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [usage, setUsage] = useState<Record<string, { limit: number | null; used: number; resetMode: string; resetHour: number; resetDay: number; nextResetAt: string | null; lastResetAt: string | null }>>({});
  const [limitEditing, setLimitEditing] = useState<string | null>(null);
  const [limitValue, setLimitValue] = useState("");
  const [resetEditing, setResetEditing] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState<"off" | "daily" | "weekly" | "monthly">("off");
  const [resetHour, setResetHour] = useState("0");
  const [resetDay, setResetDay] = useState("1");
  const [resetBusy, setResetBusy] = useState(false);
  const [modelsMap, setModelsMap] = useState<Record<string, string[] | null>>({});
  const [modelEditing, setModelEditing] = useState<string | null>(null);
  const [modelAll, setModelAll] = useState(true);
  const [modelSel, setModelSel] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<Array<{ name: string; label?: string; models: string[] }>>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [modelQuery, setModelQuery] = useState("");

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
        const map: Record<string, { limit: number | null; used: number; resetMode: string; resetHour: number; resetDay: number; nextResetAt: string | null; lastResetAt: string | null }> = {};
        for (const u of d.users || []) map[u.login] = {
          limit: u.limit, used: u.used,
          resetMode: u.resetMode ?? "off", resetHour: u.resetHour ?? 0, resetDay: u.resetDay ?? 1,
          nextResetAt: u.nextResetAt ?? null, lastResetAt: u.lastResetAt ?? null,
        };
        setUsage(map);
      })
      .catch(() => {});
  };

  const loadModels = () => {
    fetch("/api/admin/user-models")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string[] | null> = {};
        for (const u of d.users || []) map[u.login] = u.models ?? null;
        setModelsMap(map);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadUsers();
    loadLimits();
    loadModels();
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

  const handleResetUsage = async (login: string) => {
    const res = await fetch("/api/admin/limits/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      toast.success(`Расход токенов для «${login}» обнулён`);
      loadLimits();
    } else {
      toast.error(data?.message ?? "Не удалось сбросить расход");
    }
  };

  const openResetEditor = (login: string) => {
    setResetEditing(login);
    const u = usage[login];
    setResetMode((u?.resetMode as "off" | "daily" | "weekly" | "monthly") || "off");
    setResetHour(String(u?.resetHour ?? 0));
    setResetDay(String(u?.resetDay ?? 1));
  };
  const saveResetConfig = async () => {
    if (!resetEditing) return;
    const hour = Number(resetHour);
    const day = Number(resetDay);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      toast.error("Час — целое число от 0 до 23");
      return;
    }
    if (resetMode === "weekly" && (!Number.isInteger(day) || day < 1 || day > 7)) {
      toast.error("День недели — от 1 (Пн) до 7 (Вс)");
      return;
    }
    if (resetMode === "monthly" && (!Number.isInteger(day) || day < 1 || day > 28)) {
      toast.error("Число месяца — от 1 до 28");
      return;
    }
    setResetBusy(true);
    try {
      const res = await fetch("/api/admin/limits/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: resetEditing, mode: resetMode, hour, day }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        toast.success(resetMode === "off" ? `Авто-сброс для «${resetEditing}» выключен` : `Авто-сброс для «${resetEditing}» настроен`);
        setResetEditing(null);
        loadLimits();
      } else {
        toast.error(data?.message ?? "Не удалось сохранить авто-сброс");
      }
    } finally {
      setResetBusy(false);
    }
  };

  const openModelEditor = (login: string) => {
    setModelEditing(login);
    setModelQuery("");
    const cur = modelsMap[login];
    setModelAll(cur == null);
    setModelSel(cur ? [...cur] : []);
    if (!catalog.length) {
      setCatalogLoading(true);
      fetch("/api/admin/models")
        .then((r) => r.json())
        .then((d) => setCatalog(d.providers || []))
        .catch(() => {})
        .finally(() => setCatalogLoading(false));
    }
  };
  const toggleModel = (key: string) => {
    setModelAll(false);
    setModelSel((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  };
  const saveModels = async () => {
    if (!modelEditing) return;
    if (!modelAll && modelSel.length === 0) {
      toast.error("Выберите хотя бы одну модель или включите «Все модели»");
      return;
    }
    const res = await fetch("/api/admin/user-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: modelEditing, models: modelAll ? null : modelSel }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      toast.success(modelAll ? `«${modelEditing}»: разрешены все модели` : `«${modelEditing}»: разрешено моделей — ${modelSel.length}`);
      setModelEditing(null);
      loadModels();
    } else {
      toast.error(data?.message ?? "Не удалось сохранить список моделей");
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openLimitEditor(login)}
                    className="rounded-lg px-2 py-1 text-xs text-mint transition-colors hover:bg-[rgba(143,184,174,0.1)]"
                  >
                    {usage[login]?.limit ? "Изменить" : "Задать"}
                  </button>
                  <button
                    onClick={() => handleResetUsage(login)}
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
                const u = usage[login];
                const mode = u?.resetMode ?? "off";
                const label =
                  mode === "daily" ? `Ежедневно ${String(u?.resetHour ?? 0).padStart(2, "0")}:00`
                  : mode === "weekly" ? `Еженедельно (${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][(u?.resetDay ?? 1) - 1]})`
                  : mode === "monthly" ? `Ежемесячно (${u?.resetDay ?? 1}-го)`
                  : "Выкл";
                return (
                  <button
                    onClick={() => openResetEditor(login)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-[rgba(143,184,174,0.1)]"
                  >
                    <CalendarClock className="h-3.5 w-3.5 text-mint" />
                    <span className={mode === "off" ? "text-[rgba(165,187,179,0.6)]" : "text-mint"}>{label}</span>
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
                    onClick={() => openModelEditor(login)}
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

      <AdminModal
        isOpen={resetEditing !== null}
        onClose={() => setResetEditing(null)}
        title={`Авто-сброс расхода — ${resetEditing ?? ""}`}
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setResetEditing(null)}>Отмена</GlassButton>
            <GlassButton size="sm" onClick={saveResetConfig} disabled={resetBusy}>Сохранить</GlassButton>
          </>
        }
      >
        <div className="space-y-2">
          <label className="text-sm font-medium text-[rgba(220,235,230,0.7)]">Периодичность</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["off", "Выключен"],
              ["daily", "Ежедневно"],
              ["weekly", "Еженедельно"],
              ["monthly", "Ежемесячно"],
            ] as const).map(([m, lbl]) => (
              <button
                key={m}
                onClick={() => setResetMode(m)}
                className={`py-2 rounded-xl text-sm transition-all ${
                  resetMode === m
                    ? "bg-[rgba(143,184,174,0.2)] text-[rgba(220,235,230,0.9)]"
                    : "text-[rgba(165,187,179,0.5)] hover:bg-[rgba(143,184,174,0.08)]"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        {resetMode !== "off" && (
          <div className="mt-4 flex gap-3">
            <GlassInput
              label="Час (0–23, UTC)"
              type="number"
              value={resetHour}
              onChange={(e) => setResetHour(e.target.value)}
            />
            {resetMode === "weekly" && (
              <GlassInput
                label="День (1=Пн - 7=Вс)"
                type="number"
                value={resetDay}
                onChange={(e) => setResetDay(e.target.value)}
              />
            )}
            {resetMode === "monthly" && (
              <GlassInput
                label="Число (1–28)"
                type="number"
                value={resetDay}
                onChange={(e) => setResetDay(e.target.value)}
              />
            )}
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-[rgba(165,187,179,0.55)]">
          В указанное время израсходованные токены пользователя обнуляются (лимит сохраняется).
          Время — серверное (UTC). Проверка планировщиком раз в минуту.
          {usage[resetEditing ?? ""]?.nextResetAt ? (
            <> Ближайший сброс: <span className="text-[rgba(220,235,230,0.85)]">{formatDate(usage[resetEditing ?? ""].nextResetAt!)}</span>.</>
          ) : null}
          {usage[resetEditing ?? ""]?.lastResetAt ? (
            <> Последний: <span className="text-[rgba(220,235,230,0.85)]">{formatDate(usage[resetEditing ?? ""].lastResetAt!)}</span>.</>
          ) : null}
        </p>
      </AdminModal>

      <AdminModal
        isOpen={modelEditing !== null}
        onClose={() => setModelEditing(null)}
        title={`Доступные модели — ${modelEditing ?? ""}`}
        wide
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setModelEditing(null)}>Отмена</GlassButton>
            <GlassButton size="sm" onClick={saveModels}>Сохранить</GlassButton>
          </>
        }
      >
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-[rgba(143,184,174,0.06)] px-3 py-2.5">
          <input
            type="checkbox"
            checked={modelAll}
            onChange={(e) => { setModelAll(e.target.checked); if (e.target.checked) setModelSel([]); }}
            className="h-4 w-4 accent-[#8FB8AE]"
          />
          <span className="text-sm text-[rgba(220,235,230,0.9)]">Все модели (без ограничений)</span>
        </label>
        <p className="mt-2 text-xs leading-relaxed text-[rgba(165,187,179,0.55)]">
          Снимите галочку, чтобы разрешить только отмеченные модели. Пикер в чате пользователя
          покажет лишь их, переключение на остальные блокируется шлюзом.
        </p>
        <input
          type="search"
          value={modelQuery}
          onChange={(e) => setModelQuery(e.target.value)}
          placeholder="Поиск модели… например glm-5.3"
          className="mt-3 w-full rounded-xl border border-[rgba(143,184,174,0.15)] bg-[rgba(143,184,174,0.06)] px-3 py-2 text-sm text-[rgba(220,235,230,0.9)] outline-none placeholder:text-[rgba(165,187,179,0.4)] focus:border-[rgba(143,184,174,0.4)]"
        />
        <div className={`mt-4 space-y-4 ${modelAll ? "pointer-events-none opacity-40" : ""}`}>
          {catalogLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-xl bg-[rgba(143,184,174,0.06)]" />)}</div>
          ) : catalog.length === 0 ? (
            <p className="py-3 text-center text-xs text-[rgba(165,187,179,0.5)]">Каталог моделей недоступен</p>
          ) : (
            (() => {
              const q = modelQuery.trim().toLowerCase();
              const rows = catalog
                .map((p) => ({
                  ...p,
                  models: (p.models || []).filter(
                    (m) => !q || m.toLowerCase().includes(q) || (p.label || p.name).toLowerCase().includes(q),
                  ),
                }))
                .filter((p) => p.models.length > 0);
              if (q && rows.length === 0) {
                return (
                  <p className="py-3 text-center text-xs text-[rgba(165,187,179,0.5)]">
                    По запросу «{modelQuery}» ничего не найдено
                  </p>
                );
              }
              return rows.map((p) => (
                <div key={p.name}>
                  <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[rgba(165,187,179,0.5)]">
                    {p.label || p.name} · {p.models.length}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.models.map((m) => {
                      const key = `${p.name}/${m}`;
                      const checked = modelSel.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleModel(key)}
                          className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] transition-all ${
                            checked
                              ? "bg-[rgba(143,184,174,0.25)] text-[rgba(220,235,230,0.95)]"
                              : "bg-[rgba(143,184,174,0.06)] text-[rgba(165,187,179,0.7)] hover:bg-[rgba(143,184,174,0.14)]"
                          }`}
                        >
                          {checked && <Check className="h-3 w-3 text-mint" />}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      </AdminModal>
    </div>
  );
}
