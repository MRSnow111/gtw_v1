"use client";

/**
 * Модалка «Новый пользователь» (волна 5, D1) — вынесена из page.tsx 1:1:
 * те же поля, кнопки ролей, тексты и POST /api/admin/users.
 */
import { AdminModal } from "@/components/admin/AdminModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import type { UserCreateForm } from "./hooks";

export function UserCreateModal({ form }: { form: UserCreateForm }) {
  return (
    <AdminModal
      isOpen={form.open}
      onClose={form.hide}
      title="Новый пользователь"
      footer={
        <>
          <GlassButton size="sm" variant="ghost" onClick={form.hide}>Отмена</GlassButton>
          <GlassButton size="sm" onClick={form.submit}>Создать</GlassButton>
        </>
      }
    >
      <GlassInput label="Логин" value={form.login} onChange={(e) => form.setLogin(e.target.value)} />
      <GlassInput label="Пароль" type="password" value={form.password} onChange={(e) => form.setPassword(e.target.value)} />
      <div className="space-y-2">
        <label className="text-sm font-medium text-[rgba(220,235,230,0.7)]">Роль</label>
        <div className="flex gap-2">
          <button
            onClick={() => form.setRole("user")}
            className={`flex-1 py-2 rounded-xl text-sm transition-all ${
              form.role === "user"
                ? "bg-[rgba(143,184,174,0.2)] text-[rgba(220,235,230,0.9)]"
                : "text-[rgba(165,187,179,0.5)] hover:bg-[rgba(143,184,174,0.08)]"
            }`}
          >
            Пользователь
          </button>
          <button
            onClick={() => form.setRole("admin")}
            className={`flex-1 py-2 rounded-xl text-sm transition-all ${
              form.role === "admin"
                ? "bg-[rgba(240,192,64,0.2)] text-[rgba(240,192,64,0.9)]"
                : "text-[rgba(165,187,179,0.5)] hover:bg-[rgba(143,184,174,0.08)]"
            }`}
          >
            Админ
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
