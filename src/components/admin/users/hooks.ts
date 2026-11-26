"use client";

/**
 * Хуки форм/действий страницы /admin/users (волна 5, D1).
 *
 * Вся логика модалок вынесена из page.tsx без изменений: те же проверки,
 * те же тексты toast, те же тела запросов и перезагрузка нужного источника
 * после успеха. Каждый хук возвращает готовый пропс-пакет для своей модалки.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { CatalogProvider, LimitInfo, ResetMode } from "./types";
import {
  createUserApi,
  deleteUserApi,
  fetchCatalog,
  resetUsageApi,
  saveAutoResetApi,
  saveLimitApi,
  saveUserModelsApi,
} from "./api";

/* ─────────── лимит токенов ─────────── */

export interface LimitEditor {
  login: string | null;
  value: string;
  setValue: (v: string) => void;
  open: (login: string, current: number | null) => void;
  close: () => void;
  save: () => Promise<void>;
}

export function useLimitEditor(onSaved: () => void): LimitEditor {
  const [login, setLogin] = useState<string | null>(null);
  const [value, setValue] = useState("");

  const open = useCallback((next: string, current: number | null) => {
    setLogin(next);
    setValue(current ? String(current) : "");
  }, []);

  const save = useCallback(async () => {
    if (!login) return;
    const n = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      toast.error("Лимит — целое число токенов (пусто или 0 = без лимита)");
      return;
    }
    const res = await saveLimitApi(login, n);
    if (res.ok) {
      toast.success(n > 0 ? `Лимит для «${login}»: ${n.toLocaleString("ru-RU")} токенов` : `Лимит для «${login}» снят`);
      setLogin(null);
      onSaved();
    } else {
      toast.error(res.message ?? "Не удалось сохранить лимит");
    }
  }, [login, value, onSaved]);

  return { login, value, setValue, open, close: () => setLogin(null), save };
}

/* ─────────── авто-сброс расхода ─────────── */

export interface AutoResetEditor {
  login: string | null;
  mode: ResetMode;
  setMode: (m: ResetMode) => void;
  hour: string;
  setHour: (v: string) => void;
  day: string;
  setDay: (v: string) => void;
  busy: boolean;
  open: (login: string, current?: LimitInfo) => void;
  close: () => void;
  save: () => Promise<void>;
}

export function useAutoResetEditor(onSaved: () => void): AutoResetEditor {
  const [login, setLogin] = useState<string | null>(null);
  const [mode, setMode] = useState<ResetMode>("off");
  const [hour, setHour] = useState("0");
  const [day, setDay] = useState("1");
  const [busy, setBusy] = useState(false);

  const open = useCallback((next: string, current?: LimitInfo) => {
    setLogin(next);
    setMode((current?.resetMode as ResetMode) || "off");
    setHour(String(current?.resetHour ?? 0));
    setDay(String(current?.resetDay ?? 1));
  }, []);

  const save = useCallback(async () => {
    if (!login) return;
    const h = Number(hour);
    const d = Number(day);
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      toast.error("Час — целое число от 0 до 23");
      return;
    }
    if (mode === "weekly" && (!Number.isInteger(d) || d < 1 || d > 7)) {
      toast.error("День недели — от 1 (Пн) до 7 (Вс)");
      return;
    }
    if (mode === "monthly" && (!Number.isInteger(d) || d < 1 || d > 28)) {
      toast.error("Число месяца — от 1 до 28");
      return;
    }
    setBusy(true);
    try {
      const res = await saveAutoResetApi(login, mode, h, d);
      if (res.ok) {
        toast.success(mode === "off" ? `Авто-сброс для «${login}» выключен` : `Авто-сброс для «${login}» настроен`);
        setLogin(null);
        onSaved();
      } else {
        toast.error(res.message ?? "Не удалось сохранить авто-сброс");
      }
    } finally {
      setBusy(false);
    }
  }, [login, mode, hour, day, onSaved]);

  return {
    login, mode, setMode, hour, setHour, day, setDay, busy,
    open, close: () => setLogin(null), save,
  };
}

/* ─────────── белый список моделей ─────────── */

export interface AllowlistEditor {
  login: string | null;
  all: boolean;
  setAll: (v: boolean) => void;
  sel: string[];
  setSel: (v: string[]) => void;
  query: string;
  setQuery: (v: string) => void;
  catalog: CatalogProvider[];
  catalogLoading: boolean;
  toggle: (key: string) => void;
  open: (login: string, current: string[] | null) => void;
  close: () => void;
  save: () => Promise<void>;
}

export function useAllowlistEditor(onSaved: () => void): AllowlistEditor {
  const [login, setLogin] = useState<string | null>(null);
  const [all, setAll] = useState(true);
  const [sel, setSel] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true);
    fetchCatalog()
      .then(setCatalog)
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  }, []);

  const open = useCallback(
    (next: string, current: string[] | null) => {
      setLogin(next);
      setQuery("");
      setAll(current == null);
      setSel(current ? [...current] : []);
      if (!catalog.length) loadCatalog();
    },
    [catalog.length, loadCatalog],
  );

  const toggle = useCallback((key: string) => {
    setAll(false);
    setSel((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }, []);

  const save = useCallback(async () => {
    if (!login) return;
    if (!all && sel.length === 0) {
      toast.error("Выберите хотя бы одну модель или включите «Все модели»");
      return;
    }
    const res = await saveUserModelsApi(login, all ? null : sel);
    if (res.ok) {
      toast.success(all ? `«${login}»: разрешены все модели` : `«${login}»: разрешено моделей — ${sel.length}`);
      setLogin(null);
      onSaved();
    } else {
      toast.error(res.message ?? "Не удалось сохранить список моделей");
    }
  }, [login, all, sel, onSaved]);

  return {
    login, all, setAll, sel, setSel, query, setQuery, catalog, catalogLoading,
    toggle, open, close: () => setLogin(null), save,
  };
}

/* ─────────── создание пользователя ─────────── */

export interface UserCreateForm {
  open: boolean;
  login: string;
  setLogin: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  role: "admin" | "user";
  setRole: (r: "admin" | "user") => void;
  show: () => void;
  hide: () => void;
  submit: () => Promise<void>;
}

export function useUserCreate(onCreated: () => void): UserCreateForm {
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");

  const submit = useCallback(async () => {
    if (!login || !password) {
      toast.error("Заполните все поля");
      return;
    }
    const res = await createUserApi(login, password, role);
    if (res.ok) {
      toast.success(`Пользователь «${login}» создан — можно входить`);
      setOpen(false);
      setLogin("");
      setPassword("");
      setRole("user");
      onCreated();
    } else {
      toast.error(res.message ?? "Не удалось создать пользователя");
    }
  }, [login, password, role, onCreated]);

  return {
    open, login, setLogin, password, setPassword, role, setRole,
    show: () => setOpen(true),
    hide: () => setOpen(false),
    submit,
  };
}

/* ─────────── действия в строке таблицы ─────────── */

export function useUserActions(onUsersChanged: () => void, onLimitsChanged: () => void) {
  const resetUsage = useCallback(
    async (login: string) => {
      const res = await resetUsageApi(login);
      if (res.ok) {
        toast.success(`Расход токенов для «${login}» обнулён`);
        onLimitsChanged();
      } else {
        toast.error(res.message ?? "Не удалось сбросить расход");
      }
    },
    [onLimitsChanged],
  );

  const remove = useCallback(
    async (id: string) => {
      const res = await deleteUserApi(id);
      if (res.ok) {
        toast.success("Пользователь удалён");
        onUsersChanged();
      } else {
        toast.error(res.message ?? "Не удалось удалить");
      }
    },
    [onUsersChanged],
  );

  return { resetUsage, remove };
}
