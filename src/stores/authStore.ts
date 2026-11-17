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
  /** DEMO: any non-empty credentials are accepted after a short delay.
   *  Replace with real WS/HTTP auth when backend is ready. */
  login: (username: string, _password: string) => Promise<void>;
  logout: () => void;
  setHydrated: () => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      login: async (username) => {
        await delay(800); // имитация сетевого запроса
        set({ user: { name: username, role: "владелец" } });
      },
      logout: () => set({ user: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "gtw-auth",
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
