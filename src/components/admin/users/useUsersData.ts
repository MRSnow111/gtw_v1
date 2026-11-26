"use client";

/**
 * Данные страницы /admin/users (волна 5, D1).
 *
 * Три независимых источника (пользователи / лимиты / белые списки моделей) +
 * точечные перезагрузки после мутаций. Логика и порядок запросов — как в
 * исходном page.tsx: список грузится без catch (страница остаётся с пустой
 * таблицей), лимиты и allowlistи молча игнорируют ошибку.
 */
import { useCallback, useEffect, useState } from "react";
import type { AdminUser, LimitInfo } from "./types";
import { fetchLimits, fetchUserModels, fetchUsers } from "./api";

export interface UsersData {
  users: AdminUser[];
  loading: boolean;
  usage: Record<string, LimitInfo>;
  modelsMap: Record<string, string[] | null>;
  loadUsers: () => void;
  loadLimits: () => void;
  loadModels: () => void;
}

export function useUsersData(): UsersData {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<Record<string, LimitInfo>>({});
  const [modelsMap, setModelsMap] = useState<Record<string, string[] | null>>({});

  const loadUsers = useCallback(() => {
    fetchUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const loadLimits = useCallback(() => {
    fetchLimits()
      .then((d) => {
        if (!d) return;
        const map: Record<string, LimitInfo> = {};
        for (const u of d.users || []) {
          map[u.login] = {
            limit: u.limit ?? null,
            used: u.used ?? 0,
            resetMode: u.resetMode ?? "off",
            resetHour: u.resetHour ?? 0,
            resetDay: u.resetDay ?? 1,
            nextResetAt: u.nextResetAt ?? null,
            lastResetAt: u.lastResetAt ?? null,
          };
        }
        setUsage(map);
      })
      .catch(() => {});
  }, []);

  const loadModels = useCallback(() => {
    fetchUserModels()
      .then((rows) => {
        const map: Record<string, string[] | null> = {};
        for (const u of rows) map[u.login] = u.models ?? null;
        setModelsMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadUsers();
    loadLimits();
    loadModels();
  }, [loadUsers, loadLimits, loadModels]);

  return { users, loading, usage, modelsMap, loadUsers, loadLimits, loadModels };
}
