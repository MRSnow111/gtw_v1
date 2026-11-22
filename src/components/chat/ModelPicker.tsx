"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Cpu, RefreshCw, X } from "lucide-react";
import { useModelStore } from "@/stores/modelStore";
import { useAgentStore } from "@/stores/agentStore";

/**
 * Пикер модели в шапке чата (LIVE). Показывает текущую модель и каталог
 * доступных. Для не-админа server.js отдаёт каталог, отфильтрованный по
 * белому списку пользователя (restricted=true) — лишних моделей не видно.
 */
export function ModelPicker({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const catalog = useModelStore((s) => s.catalogByChat[chatId]);
  const loading = useModelStore((s) => !!s.loadingByChat[chatId]);
  const switching = useModelStore((s) => !!s.switchingByChat[chatId]);
  const requestModels = useModelStore((s) => s.requestModels);
  const setModel = useModelStore((s) => s.setModel);
  const info = useAgentStore((s) => s.sessionInfoByChat?.[chatId]);

  const currentKey = catalog?.current
    ? `${catalog.current.provider}/${catalog.current.model}`
    : info
      ? `${info.provider}/${info.model}`
      : "";
  const currentLabel = catalog?.current?.model || info?.model || "модель";
  const providers = catalog?.providers ?? [];
  const hasModels = providers.some((p) => p.models && p.models.length);

  useEffect(() => {
    if (open) requestModels(chatId);
  }, [open, chatId, requestModels]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Выбор модели"
        title="Выбор модели"
        className="glass-light flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] text-dim transition-colors hover:text-foreground"
      >
        <Cpu className="h-3.5 w-3.5 text-mint" />
        <span className="max-w-[130px] truncate">{currentLabel}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong absolute right-0 top-[46px] z-30 w-[300px] rounded-2xl border border-white/[0.09] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
            style={{ background: "linear-gradient(135deg, rgba(23,46,42,0.985), rgba(13,28,25,0.99))" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-dim">Модель</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => requestModels(chatId)}
                  aria-label="Обновить каталог"
                  title="Обновить каталог"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-dim transition-colors hover:bg-white/[0.06] hover:text-mint"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-dim transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {loading && !catalog ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-7 rounded-xl" />
                ))}
              </div>
            ) : !catalog || !hasModels ? (
              <div className="py-3 text-center text-[11.5px] text-dim">
                {catalog?.restricted
                  ? "Нет доступных моделей — обратитесь к администратору"
                  : "Каталог моделей недоступен"}
              </div>
            ) : (
              <div className="scroll-area max-h-[300px] space-y-3 overflow-y-auto pr-1">
                {providers.map((p) => (
                  <div key={p.name}>
                    <div className="mb-1.5 text-[10px] uppercase tracking-wider text-dim">
                      {p.label || p.name}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(p.models || []).map((m) => {
                        const key = `${p.name}/${m}`;
                        const isCurrent = key === currentKey;
                        return (
                          <button
                            key={key}
                            disabled={switching}
                            onClick={() => setModel(chatId, key)}
                            title={isCurrent ? "Текущая модель" : `Переключить на ${key}`}
                            className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] transition-all disabled:opacity-50 ${
                              isCurrent
                                ? "bg-[rgba(143,184,174,0.25)] text-foreground"
                                : "bg-[rgba(143,184,174,0.06)] text-dim hover:bg-[rgba(143,184,174,0.14)] hover:text-foreground"
                            }`}
                          >
                            {isCurrent && <Check className="h-3 w-3 text-mint" />}
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {catalog?.restricted && (
              <p className="mt-3 border-t border-white/[0.07] pt-2 text-[10px] leading-snug text-dim">
                Показаны только модели, разрешённые администратором.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
