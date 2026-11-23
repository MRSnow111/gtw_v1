"use client";

import { create } from "zustand";
import type { Project } from "@/lib/demoData";
import { DEMO_MODE, useAgentStore } from "@/stores/agentStore";

/**
 * Проекты пользователя (фаза 3). LIVE: REST /api/projects (per-login, серверное
 * хранение). DEMO: локально в памяти. Чаты привязываются через project_id;
 * перемещение чата обновляет useAgentStore и серверный реестр.
 */
interface ProjectState {
  projects: Project[];
  loaded: boolean;
  loading: boolean;
  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<Project | null>;
  renameProject: (id: string, name: string) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  moveChat: (chatId: string, projectId: string | null) => Promise<void>;
}

function unlinkChatsLocally(projectId: string) {
  useAgentStore.setState((s) => ({
    chats: s.chats.map((c) => (c.projectId === projectId ? { ...c, projectId: null } : c)),
  }));
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loaded: false,
  loading: false,

  loadProjects: async () => {
    if (get().loading) return;
    set({ loading: true });
    if (DEMO_MODE) {
      set({ loaded: true, loading: false });
      return;
    }
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        set({ projects: data.projects || [], loaded: true });
      }
    } catch {
      /* ignore */
    } finally {
      set({ loading: false });
    }
  },

  createProject: async (name) => {
    const clean = name.trim();
    if (!clean) return null;
    if (DEMO_MODE) {
      const p: Project = {
        id: `p${Date.now()}`, name: clean, slug: clean.toLowerCase().replace(/\s+/g, "-"),
        archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      set((s) => ({ projects: [p, ...s.projects] }));
      return p;
    }
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      if (res.ok) {
        const data = await res.json();
        const p = data.project as Project;
        set((s) => ({ projects: [p, ...s.projects.filter((x) => x.id !== p.id)] }));
        return p;
      }
    } catch {
      /* ignore */
    }
    return null;
  },

  renameProject: async (id, name) => {
    const clean = name.trim();
    if (!clean) return;
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name: clean } : p)) }));
    if (DEMO_MODE) return;
    try {
      await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
    } catch {
      /* ignore */
    }
  },

  setArchived: async (id, archived) => {
    set((s) => ({
      projects: archived
        ? s.projects.filter((p) => p.id !== id)
        : s.projects.map((p) => (p.id === id ? { ...p, archived } : p)),
    }));
    if (DEMO_MODE) return;
    try {
      await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
    } catch {
      /* ignore */
    }
  },

  deleteProject: async (id) => {
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
    unlinkChatsLocally(id);
    if (DEMO_MODE) return;
    try {
      await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  },

  moveChat: async (chatId, projectId) => {
    useAgentStore.setState((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, projectId } : c)),
    }));
    if (DEMO_MODE) return;
    try {
      await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
    } catch {
      /* ignore */
    }
  },
}));
