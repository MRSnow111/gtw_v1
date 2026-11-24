"use client";

import { create } from "zustand";

/** Ширины панели артефактов (px). Панель можно тянуть за левый край и
 *  быстро переключать «узкая ↔ широкая» кнопкой в шапке. */
export const ARTIFACT_MIN_WIDTH = 240;
export const ARTIFACT_DEFAULT_WIDTH = 300;
export const ARTIFACT_WIDE_WIDTH = 560;
export const ARTIFACT_MAX_WIDTH = 760;
const WIDTH_KEY = "gtw-artifact-width";

export function clampArtifactWidth(w: number, viewport = 1600): number {
  // не даём панели съесть весь экран: оставляем место сайдбару и чату
  const max = Math.min(ARTIFACT_MAX_WIDTH, Math.max(ARTIFACT_MIN_WIDTH, viewport - 650));
  if (!Number.isFinite(w)) return ARTIFACT_DEFAULT_WIDTH;
  return Math.round(Math.min(max, Math.max(ARTIFACT_MIN_WIDTH, w)));
}

/** Чтение сохранённой ширины (только в браузере, после маунта — без SSR-рассинхрона). */
export function loadArtifactWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? clampArtifactWidth(n, window.innerWidth) : null;
  } catch {
    return null;
  }
}

interface UiState {
  settingsOpen: boolean;
  drawerOpen: boolean;
  /** bump to request focus into the composer (welcome cards use it) */
  composerFocusTick: number;
  /** текущая ширина правой панели артефактов, px */
  artifactWidth: number;
  setSettingsOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  focusComposer: () => void;
  setArtifactWidth: (w: number) => void;
  /** узкая ↔ широкая (порог — середина между default и wide) */
  toggleArtifactWide: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  settingsOpen: false,
  drawerOpen: false,
  composerFocusTick: 0,
  artifactWidth: ARTIFACT_DEFAULT_WIDTH,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  focusComposer: () => set((s) => ({ composerFocusTick: s.composerFocusTick + 1 })),
  setArtifactWidth: (w) => {
    const viewport = typeof window !== "undefined" ? window.innerWidth : 1600;
    const width = clampArtifactWidth(w, viewport);
    set({ artifactWidth: width });
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* private mode — ignore */
    }
  },
  toggleArtifactWide: () => {
    const wide = get().artifactWidth >= (ARTIFACT_DEFAULT_WIDTH + ARTIFACT_WIDE_WIDTH) / 2;
    get().setArtifactWidth(wide ? ARTIFACT_DEFAULT_WIDTH : ARTIFACT_WIDE_WIDTH);
  },
}));
