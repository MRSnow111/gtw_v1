"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, Cpu, Gauge, RefreshCw, Wrench, Zap } from "lucide-react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { GlassButton } from "@/components/ui/GlassButton";

interface SessionRow {
  chatId: string;
  login: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  turns: number;
  tools: number;
  toolNames: string[];
  speed: number | null;
  source: string;
  updatedAt: string;
  lastActivity: string;
  limit: number | null;
  usedByLogin: number;
}

interface ModelProvider { name: string; models: string[] }

const fmt = (n: number) => n.toLocaleString("ru-RU");
const isActive = (iso: string) =>
  !!iso && Date.now() - new Date(iso).getTime() < 15 * 60 * 1000;

export default function AdminSessionsPage() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");

  // переключение модели
  const [modelChat, setModelChat] = useState<string | null>(null);
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [current, setCurrent] = useState<{ model: string; provider: string } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [picked, setPicked] = useState("");
  const [applying, setApplying] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/sessions")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.items || []);
        setLive(!!d.live);
        setUpdatedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const openModelEditor = async (chatId: string) => {
    setModelChat(chatId);
    setPicked("");
    setCatalogLoading(true);
    try {
      const r = await fetch(`/api/admin/models?chatId=${encodeURIComponent(chatId)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || "Ошибка");
      setProviders(d.providers || []);
      setCurrent(d.current || null);
      if (!d.live) toast.warning("Шлюз недоступен — каталог моделей не получен");
    } catch {
      toast.error("Не удалось получить каталог моделей");
      setProviders([]);
      setCurrent(null);
    } finally {
      setCatalogLoading(false);
    }
  };

  const applyModel = async () => {
    if (!modelChat || !picked) return;
    setApplying(true);
    try {
      const r = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: modelChat, model: picked }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) {
        toast.success(`Модель чата переключена на «${picked}» (со следующего хода)`);
        setModelChat(null);
        load();
      } else {
        toast.error(d?.message || "Агент не подтвердил переключение");
      }
    } catch {
      toast.error("Шлюз недоступен");
    } finally {
      setApplying(false);
    }
  };

  const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
  const totalTurns = rows.reduce((s, r) => s + r.turns, 0);
  const totalTools = rows.reduce((s, r) => s + r.tools, 0);
  const activeCount = rows.filter((r) => isActive(r.lastActivity)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Сессии</h1>
          <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
            Чаты агента: модель, токены, скорость, инструменты
          </p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs text-[rgba(165,187,179,0.45)]">обновлено {updatedAt}</span>
          )}
          <GlassButton size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={load}>
            Обновить
          </GlassButton>
        </div>
      </div>

      {!loading && !live && (
        <div className="rounded-xl border border-[rgba(240,192,64,0.25)] bg-[rgba(240,192,64,0.06)] px-4 py-3 text-sm text-[rgba(240,192,64,0.85)]">
          Шлюз агента недоступен — показаны последние сохранённые снимки сессий.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AdminCard title="Активные чаты" icon={<Activity className="h-5 w-5" />} variant="light">
          <div className="text-2xl font-semibold text-[#75D6A8]">{activeCount}</div>
          <div className="mt-1 text-xs text-[rgba(165,187,179,0.5)]">активность за 15 минут</div>
        </AdminCard>
        <AdminCard title="Токены" icon={<Zap className="h-5 w-5" />} variant="light">
          <div className="text-2xl font-semibold text-[rgba(220,235,230,0.95)]">{fmt(totalTokens)}</div>
          <div className="mt-1 text-xs text-[rgba(165,187,179,0.5)]">сумма по чатам (сброс при /new)</div>
        </AdminCard>
        <AdminCard title="Ходы агента" icon={<Gauge className="h-5 w-5" />} variant="light">
          <div className="text-2xl font-semibold text-[rgba(220,235,230,0.95)]">{fmt(totalTurns)}</div>
          <div className="mt-1 text-xs text-[rgba(165,187,179,0.5)]">сообщений обработано</div>
        </AdminCard>
        <AdminCard title="Инструменты" icon={<Wrench className="h-5 w-5" />} variant="light">
          <div className="text-2xl font-semibold text-[rgba(220,235,230,0.95)]">{fmt(totalTools)}</div>
          <div className="mt-1 text-xs text-[rgba(165,187,179,0.5)]">вызовов инструментов</div>
        </AdminCard>
      </div>

      {loading ? (
        <div className="h-48 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
      ) : (
        <AdminTable
          columns={[
            {
              key: "login",
              label: "Пользователь",
              render: (v: string) => (
                <span className={v && v !== "gtw" ? "text-[rgba(220,235,230,0.9)]" : "text-[rgba(165,187,179,0.5)]"}>
                  {v || "—"}
                </span>
              ),
            },
            {
              key: "chatId",
              label: "Чат",
              render: (v: string, row: SessionRow) => (
                <div>
                  <span className="font-mono text-xs text-[rgba(220,235,230,0.7)]">{v.slice(0, 18)}</span>
                  <div className="mt-0.5">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${isActive(row.lastActivity) ? "bg-[#75D6A8]" : "bg-[rgba(165,187,179,0.3)]"}`} />
                  </div>
                </div>
              ),
            },
            {
              key: "model",
              label: "Модель",
              render: (v: string, row: SessionRow) => (
                <div className="max-w-[180px]">
                  <span className="block truncate text-[rgba(220,235,230,0.9)]" title={v}>{v || "—"}</span>
                  {row.provider && (
                    <span className="block truncate text-[11px] text-[rgba(165,187,179,0.5)]">{row.provider}</span>
                  )}
                </div>
              ),
            },
            {
              key: "totalTokens",
              label: "Токены",
              render: (v: number, row: SessionRow) => (
                <div className="min-w-[100px]">
                  <span className="font-mono text-xs text-[rgba(220,235,230,0.85)]">{fmt(v)}</span>
                  <div className="text-[10.5px] text-[rgba(165,187,179,0.5)]">
                    ↑{fmt(row.tokensIn)} · ↓{fmt(row.tokensOut)}
                    {row.source === "estimate" && <span className="ml-1 text-[rgba(240,192,64,0.7)]">оценка</span>}
                  </div>
                </div>
              ),
            },
            {
              key: "speed",
              label: "Скорость",
              render: (v: number | null) => (
                <span className="font-mono text-xs text-[rgba(220,235,230,0.8)]">
                  {v !== null && v > 0 ? `${v} ток/с` : "—"}
                </span>
              ),
            },
            {
              key: "tools",
              label: "Инструменты",
              render: (v: number, row: SessionRow) => (
                <span className="text-xs text-[rgba(220,235,230,0.8)]" title={row.toolNames.join(", ")}>
                  {fmt(v)}
                  {row.toolNames.length > 0 && (
                    <span className="ml-1 text-[rgba(165,187,179,0.45)]">({row.toolNames.length})</span>
                  )}
                </span>
              ),
            },
            { key: "turns", label: "Ходы", render: (v: number) => <span className="font-mono text-xs">{fmt(v)}</span> },
            {
              key: "chatId",
              label: "Смена модели",
              render: (chatId: string) => (
                <button
                  onClick={() => openModelEditor(chatId)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-mint transition-colors hover:bg-[rgba(143,184,174,0.1)]"
                >
                  <Cpu className="h-3.5 w-3.5" /> Сменить
                </button>
              ),
            },
          ]}
          data={rows}
          emptyMessage="Сессий пока нет — отправьте сообщение агенту в чате"
        />
      )}

      <AdminModal
        isOpen={modelChat !== null}
        onClose={() => setModelChat(null)}
        title={`Модель чата ${modelChat?.slice(0, 18) ?? ""}`}
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setModelChat(null)}>Отмена</GlassButton>
            <GlassButton size="sm" onClick={applyModel} disabled={!picked || applying}>
              {applying ? "Переключаем…" : "Применить"}
            </GlassButton>
          </>
        }
      >
        {catalogLoading ? (
          <div className="h-24 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
        ) : providers.length === 0 ? (
          <p className="text-sm text-[rgba(165,187,179,0.6)]">
            Каталог моделей недоступен. Проверьте, что шлюз агента запущен.
          </p>
        ) : (
          <div className="space-y-3">
            {current && (
              <p className="text-xs text-[rgba(165,187,179,0.6)]">
                Текущая: <span className="text-[rgba(220,235,230,0.9)]">{current.model}</span>
                {current.provider ? ` (${current.provider})` : ""}
              </p>
            )}
            <div className="scroll-area max-h-64 space-y-3 overflow-auto pr-1">
              {providers.map((p) => (
                <div key={p.name}>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[rgba(165,187,179,0.5)]">
                    {p.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.models.map((m) => {
                      const key = `${p.name}/${m}`;
                      const isCurrent =
                        !!current && key === `${current.provider}/${current.model}`;
                      const isPicked = picked === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setPicked(key)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                            isPicked
                              ? "bg-[rgba(143,184,174,0.25)] text-[rgba(220,235,230,0.95)] ring-1 ring-[rgba(143,184,174,0.4)]"
                              : isCurrent
                                ? "bg-[rgba(143,184,174,0.12)] text-[rgba(220,235,230,0.85)] ring-1 ring-[rgba(143,184,174,0.25)]"
                                : "bg-[rgba(143,184,174,0.06)] text-[rgba(220,235,230,0.7)] hover:bg-[rgba(143,184,174,0.12)]"
                          }`}
                        >
                          {isCurrent && (
                            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-mint align-middle" />
                          )}
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-[rgba(165,187,179,0.5)]">
              Переключение действует со следующего хода агента в этом чате (команда /model).
            </p>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
