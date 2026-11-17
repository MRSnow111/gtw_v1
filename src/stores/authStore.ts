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
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
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
        set({ user: { name: username, role: "владелец" } });
      },
      logout: () => {
        void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        set({ user: null });
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "gtw-session", // не конфликтовать с httpOnly-кукой gtw-auth
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
