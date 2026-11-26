"use client";

/**
 * Модалка авто-сброса расхода (волна 5, D1) — вынесена из page.tsx 1:1
 * (POST /api/admin/limits/auto, те же проверки часа/дня в хуке useAutoResetEditor).
 */
import { AdminModal } from "@/components/admin/AdminModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import type { AutoResetEditor } from "./hooks";
import type { LimitInfo } from "./types";
import { RESET_MODES } from "./types";
import { formatDate } from "./format";

export function AutoResetModal({
  editor,
  current,
}: {
  editor: AutoResetEditor;
  current?: LimitInfo;
}) {
  return (
    <AdminModal
      isOpen={editor.login !== null}
      onClose={editor.close}
      title={`Авто-сброс расхода — ${editor.login ?? ""}`}
      footer={
        <>
          <GlassButton size="sm" variant="ghost" onClick={editor.close}>Отмена</GlassButton>
          <GlassButton size="sm" onClick={editor.save} disabled={editor.busy}>Сохранить</GlassButton>
        </>
      }
    >
      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgba(220,235,230,0.7)]">Периодичность</label>
        <div className="grid grid-cols-2 gap-2">
          {RESET_MODES.map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => editor.setMode(m)}
              className={`py-2 rounded-xl text-sm transition-all ${
                editor.mode === m
                  ? "bg-[rgba(143,184,174,0.2)] text-[rgba(220,235,230,0.9)]"
                  : "text-[rgba(165,187,179,0.5)] hover:bg-[rgba(143,184,174,0.08)]"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
      {editor.mode !== "off" && (
        <div className="mt-4 flex gap-3">
          <GlassInput
            label="Час (0–23, UTC)"
            type="number"
            value={editor.hour}
            onChange={(e) => editor.setHour(e.target.value)}
          />
          {editor.mode === "weekly" && (
            <GlassInput
              label="День (1=Пн - 7=Вс)"
              type="number"
              value={editor.day}
              onChange={(e) => editor.setDay(e.target.value)}
            />
          )}
          {editor.mode === "monthly" && (
            <GlassInput
              label="Число (1–28)"
              type="number"
              value={editor.day}
              onChange={(e) => editor.setDay(e.target.value)}
            />
          )}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-[rgba(165,187,179,0.55)]">
        В указанное время израсходованные токены пользователя обнуляются (лимит сохраняется).
        Время — серверное (UTC). Проверка планировщиком раз в минуту.
        {current?.nextResetAt ? (
          <> Ближайший сброс: <span className="text-[rgba(220,235,230,0.85)]">{formatDate(current.nextResetAt)}</span>.</>
        ) : null}
        {current?.lastResetAt ? (
          <> Последний: <span className="text-[rgba(220,235,230,0.85)]">{formatDate(current.lastResetAt)}</span>.</>
        ) : null}
      </p>
    </AdminModal>
  );
}
