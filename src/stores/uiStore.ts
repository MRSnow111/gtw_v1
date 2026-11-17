"use client";

import { create } from "zustand";

interface UiState {
  settingsOpen: boolean;
  drawerOpen: boolean;
  /** bump to request focus into the composer (welcome cards use it) */
  composerFocusTick: number;
  setSettingsOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  focusComposer: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  drawerOpen: false,
  composerFocusTick: 0,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  focusComposer: () => set((s) => ({ composerFocusTick: s.composerFocusTick + 1 })),
}));
