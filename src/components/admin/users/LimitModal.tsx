"use client";

/**
 * Модалка лимита токенов (волна 5, D1) — вынесена из page.tsx 1:1
 * (POST /api/admin/limits, то же текстовое пояснение и «Сейчас использовано»).
 */
import { AdminModal } from "@/components/admin/AdminModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import type { LimitEditor } from "./hooks";
import type { LimitInfo } from "./types";

export function LimitModal({
  editor,
  current,
}: {
  editor: LimitEditor;
  current?: LimitInfo;
}) {
  return (
    <AdminModal
      isOpen={editor.login !== null}
      onClose={editor.close}
      title={`Лимит токенов — ${editor.login ?? ""}`}
      footer={
        <>
          <GlassButton size="sm" variant="ghost" onClick={editor.close}>Отмена</GlassButton>
          <GlassButton size="sm" onClick={editor.save}>Сохранить</GlassButton>
        </>
      }
    >
      <GlassInput
        label="Лимит токенов (пусто или 0 = без лимита)"
        type="number"
        value={editor.value}
        onChange={(e) => editor.setValue(e.target.value)}
        placeholder="например, 500000"
      />
      <p className="text-xs leading-relaxed text-[rgba(165,187,179,0.55)]">
        Учитывается сумма входных и выходных токенов по всем чатам пользователя.
        При достижении лимита новые сообщения блокируются шлюзом до изменения лимита.
        {current ? (
          <> Сейчас использовано: <span className="text-[rgba(220,235,230,0.85)]">{current.used.toLocaleString("ru-RU")}</span>.</>
        ) : null}
      </p>
    </AdminModal>
  );
}
