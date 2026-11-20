"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  name: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  hydrated: boolean;
  sessionChecked: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      sessionChecked: false,
      // Реальный контракт §9: POST /api/auth/login, httpOnly-куку ставит сервер.
      login: async (username, password) => {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login: username, password }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Не удалось войти");
        }
        const data = await res.json().catch(() => ({}));
        set({
          user: { name: data.login ?? username, role: data.role ?? "user" },
          sessionChecked: true,
        });
      },
      logout: () => {
        void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        set({ user: null });
      },
      // Сверка с сервером: роль берётся из подписанной куки, не из localStorage.
      refresh: async () => {
        try {
          const res = await fetch("/api/auth/me");
          if (!res.ok) {
            set({ user: null, sessionChecked: true });
            return;
          }
          const data = await res.json();
          set({
            user: { name: data.login, role: data.role },
            sessionChecked: true,
          });
        } catch {
          /* сеть недоступна — не блокируем интерфейс навсегда */
          set({ sessionChecked: true });
        }
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "gtw-session", // не конфликтовать с httpOnly-кукой gtw-auth
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        // Сверяем сессию с сервером всегда: роль/срок жизни куки могли измениться.
        void state?.refresh();
      },
    }
  )
);
