"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AdminCard } from "@/components/admin/AdminCard";
import { FileText, Filter, ArrowDownUp } from "lucide-react";

type LogLevel = "info" | "warn" | "error" | "debug" | "all";

const levelColors: Record<string, string> = {
  info: "text-[#6BA3D6]",
  warn: "text-[#F0C040]",
  error: "text-[#E8605A]",
  debug: "text-[rgba(165,187,179,0.4)]",
};

const levelLabels: Record<string, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG",
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogLevel>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = async (pageNum: number, level: LogLevel) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "50",
        ...(level !== "all" && { level }),
      });
      const res = await fetch(`/api/admin/logs?${params}`);
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, filter);
  }, [filter]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLogs(nextPage, filter);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const filters: Array<{ key: LogLevel; label: string; color?: string }> = [
    { key: "all", label: "Все" },
    { key: "info", label: "INFO" },
    { key: "warn", label: "WARN" },
    { key: "error", label: "ERROR" },
    { key: "debug", label: "DEBUG" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Логи</h1>
        <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
          Журнал событий (хранение: 30 дней)
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-[rgba(165,187,179,0.4)]" />
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => { setPage(1); setFilter(f.key); }}
            className={`px-3 py-1.5 rounded-full text-xs transition-all ${
              filter === f.key
                ? "bg-[rgba(143,184,174,0.2)] text-[rgba(220,235,230,0.9)]"
                : `text-[rgba(165,187,179,0.5)] hover:bg-[rgba(143,184,174,0.08)] ${levelColors[f.key] || ""}`
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
      ) : (
        <AdminCard variant="light" className="!p-0 overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto scroll-area">
            {logs.map((log, i) => {
              const isExpanded = expanded === log.id;
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.01, 0.1) }}
                  className={`flex items-start gap-3 px-4 py-2.5 border-b border-[rgba(220,235,230,0.04)] last:border-0 hover:bg-[rgba(143,184,174,0.04)] cursor-pointer transition-colors ${
                    log.level === "error" ? "bg-[rgba(220,112,112,0.04)]" : ""
                  }`}
                  onClick={() => setExpanded(isExpanded ? null : log.id)}
                >
                  <span className={`shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    log.level === "error"
                      ? "bg-[rgba(220,112,112,0.15)] text-[#E8605A]"
                      : log.level === "warn"
                      ? "bg-[rgba(240,192,64,0.15)] text-[#F0C040]"
                      : log.level === "debug"
                      ? "bg-[rgba(165,187,179,0.1)] text-[rgba(165,187,179,0.4)]"
                      : "bg-[rgba(107,163,214,0.15)] text-[#6BA3D6]"
                  }`}>
                    {levelLabels[log.level] || log.level.toUpperCase()}
                  </span>
                  <span className="shrink-0 text-[10px] text-[rgba(165,187,179,0.35)] font-mono w-28">
                    {formatDate(log.timestamp)}
                  </span>
                  <span className="shrink-0 text-[10px] text-[rgba(143,184,174,0.4)] font-mono w-20">
                    {log.source}
                  </span>
                  <span className={`flex-1 text-xs ${levelColors[log.level] || "text-[rgba(220,235,230,0.6)]"}`}>
                    {log.message}
                  </span>
                  <ArrowDownUp className={`h-3 w-3 text-[rgba(165,187,179,0.3)] shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </motion.div>
              );
            })}
          </div>
        </AdminCard>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={handleLoadMore}
            className="px-4 py-2 rounded-full text-xs text-[rgba(143,184,174,0.6)] hover:text-[rgba(220,235,230,0.8)] hover:bg-[rgba(143,184,174,0.08)] transition-all"
          >
            Загрузить ещё ({total - logs.length} осталось)
          </button>
        </div>
      )}
    </div>
  );
}
