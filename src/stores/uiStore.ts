import { create } from "zustand";

interface UiStore {
  sidebarOpen: boolean; // только мобильный drawer (<768px)
  artifactsOpen: boolean | null; // null = по умолчанию: открыта на lg+, закрыта на телефоне
  draft: string; // текст в композере (карточки-подсказки подставляют сюда)
  setSidebarOpen: (open: boolean) => void;
  setArtifactsOpen: (open: boolean) => void;
  toggleArtifacts: (isDesktop: boolean) => void;
  setDraft: (text: string) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: false,
  // По макету панель видна на десктопе. Для «скрыта по умолчанию» (docs/design.md §6) поставь false.
  artifactsOpen: null,
  draft: "",
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setArtifactsOpen: (artifactsOpen) => set({ artifactsOpen }),
  toggleArtifacts: (isDesktop) => set((s) => ({ artifactsOpen: !(s.artifactsOpen ?? isDesktop) })),
  setDraft: (draft) => set({ draft }),
}));
