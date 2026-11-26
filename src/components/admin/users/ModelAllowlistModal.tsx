"use client";

/**
 * Модалка белого списка моделей (волна 5, D1) — вынесена из page.tsx 1:1:
 * чекбокс «Все модели», поиск по каталогу, чипы provider/model,
 * POST /api/admin/user-models (models = null при «все»).
 * Каталог грузится лениво при первом открытии (хук useAllowlistEditor).
 */
import { useMemo } from "react";
import { Check } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { GlassButton } from "@/components/ui/GlassButton";
import type { AllowlistEditor } from "./hooks";

export function ModelAllowlistModal({ editor }: { editor: AllowlistEditor }) {
  const q = editor.query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      editor.catalog
        .map((p) => ({
          ...p,
          models: (p.models || []).filter(
            (m) => !q || m.toLowerCase().includes(q) || (p.label || p.name).toLowerCase().includes(q),
          ),
        }))
        .filter((p) => p.models.length > 0),
    [editor.catalog, q],
  );

  return (
    <AdminModal
      isOpen={editor.login !== null}
      onClose={editor.close}
      title={`Доступные модели — ${editor.login ?? ""}`}
      wide
      footer={
        <>
          <GlassButton size="sm" variant="ghost" onClick={editor.close}>Отмена</GlassButton>
          <GlassButton size="sm" onClick={editor.save}>Сохранить</GlassButton>
        </>
      }
    >
      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-[rgba(143,184,174,0.06)] px-3 py-2.5">
        <input
          type="checkbox"
          checked={editor.all}
          onChange={(e) => { editor.setAll(e.target.checked); if (e.target.checked) editor.setSel([]); }}
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
        value={editor.query}
        onChange={(e) => editor.setQuery(e.target.value)}
        placeholder="Поиск модели… например glm-5.3"
        className="mt-3 w-full rounded-xl border border-[rgba(143,184,174,0.15)] bg-[rgba(143,184,174,0.06)] px-3 py-2 text-sm text-[rgba(220,235,230,0.9)] outline-none placeholder:text-[rgba(165,187,179,0.4)] focus:border-[rgba(143,184,174,0.4)]"
      />
      <div className={`mt-4 space-y-4 ${editor.all ? "pointer-events-none opacity-40" : ""}`}>
        {editor.catalogLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-xl bg-[rgba(143,184,174,0.06)]" />)}</div>
        ) : editor.catalog.length === 0 ? (
          <p className="py-3 text-center text-xs text-[rgba(165,187,179,0.5)]">Каталог моделей недоступен</p>
        ) : q && rows.length === 0 ? (
          <p className="py-3 text-center text-xs text-[rgba(165,187,179,0.5)]">
            По запросу «{editor.query}» ничего не найдено
          </p>
        ) : (
          rows.map((p) => (
            <div key={p.name}>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[rgba(165,187,179,0.5)]">
                {p.label || p.name} · {p.models.length}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.models.map((m) => {
                  const key = `${p.name}/${m}`;
                  const checked = editor.sel.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => editor.toggle(key)}
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
          ))
        )}
      </div>
    </AdminModal>
  );
}
