"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { Users, Plus } from "lucide-react";
import {
  AutoResetModal,
  LimitModal,
  ModelAllowlistModal,
  UserCreateModal,
  UsersTable,
  useAllowlistEditor,
  useAutoResetEditor,
  useLimitEditor,
  useUserActions,
  useUserCreate,
  useUsersData,
} from "@/components/admin/users";

/**
 * /admin/users (волна 5, D1): страница собрана из вынесенных частей —
 * данные в useUsersData, формы/мутации в хуках, тело таблицы и четыре модалки
 * в src/components/admin/users. Поведение и контракты API не менялись.
 */
export default function AdminUsersPage() {
  const { users, loading, usage, modelsMap, loadUsers, loadLimits, loadModels } = useUsersData();

  const limitEditor = useLimitEditor(loadLimits);
  const resetEditor = useAutoResetEditor(loadLimits);
  const allowlistEditor = useAllowlistEditor(loadModels);
  const createForm = useUserCreate(loadUsers);
  const { resetUsage, remove } = useUserActions(loadUsers, loadLimits);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Пользователи</h1>
          <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
            Управление учётными записями
          </p>
        </div>
        <GlassButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={createForm.show}>
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

      <UsersTable
        users={users}
        loading={loading}
        usage={usage}
        modelsMap={modelsMap}
        handlers={{
          onOpenLimit: limitEditor.open,
          onResetUsage: resetUsage,
          onOpenReset: resetEditor.open,
          onOpenModels: allowlistEditor.open,
          onDelete: remove,
        }}
      />

      <UserCreateModal form={createForm} />
      <LimitModal editor={limitEditor} current={usage[limitEditor.login ?? ""]} />
      <AutoResetModal editor={resetEditor} current={usage[resetEditor.login ?? ""]} />
      <ModelAllowlistModal editor={allowlistEditor} />
    </div>
  );
}
