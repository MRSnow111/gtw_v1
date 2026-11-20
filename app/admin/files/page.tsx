"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { FolderOpen, Plus, Trash2, FileText, ChevronRight, Save } from "lucide-react";

interface Entry {
  name: string;
  isDir: boolean;
  type: string;
  size: number;
  modifiedAt: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 Б";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export default function AdminFilesPage() {
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  // Редактор открытого файла
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Модалка нового файла
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const loadDir = useCallback((dir: string) => {
    setLoading(true);
    fetch(`/api/admin/files?path=${encodeURIComponent(dir)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.message ?? "Ошибка загрузки");
        setEntries(data.entries ?? []);
        setCwd(dir);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDir("");
  }, [loadDir]);

  const openFile = async (rel: string) => {
    setEditorPath(rel);
    setEditorContent("");
    setEditorLoading(true);
    try {
      const r = await fetch(`/api/admin/files?path=${encodeURIComponent(rel)}&content=1`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message ?? "Не удалось открыть файл");
      setEditorContent(data.content ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      setEditorPath(null);
    } finally {
      setEditorLoading(false);
    }
  };

  const saveFile = async () => {
    if (!editorPath) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: editorPath, content: editorContent }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message ?? "Не удалось сохранить");
      toast.success("Файл сохранён");
      setEditorPath(null);
      loadDir(cwd);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const createFile = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Введите имя файла");
      return;
    }
    if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      toast.error("Недопустимое имя файла");
      return;
    }
    const rel = joinPath(cwd, name);
    try {
      const r = await fetch("/api/admin/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: rel, content: "" }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message ?? "Не удалось создать файл");
      setCreating(false);
      setNewName("");
      loadDir(cwd);
      openFile(rel);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const deleteEntry = async (rel: string, isDir: boolean) => {
    if (!window.confirm(isDir ? `Удалить папку «${rel}» со всем содержимым?` : `Удалить файл «${rel}»?`)) {
      return;
    }
    try {
      const r = await fetch(`/api/admin/files?path=${encodeURIComponent(rel)}`, { method: "DELETE" });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message ?? "Не удалось удалить");
      toast.success("Удалено");
      loadDir(cwd);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const crumbs = cwd ? cwd.split("/") : [];
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Файлы</h1>
          <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
            Рабочие файлы шлюза — просмотр и редактирование
          </p>
        </div>
        <GlassButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          Новый файл
        </GlassButton>
      </div>

      <AdminCard title="Текущая папка" icon={<FolderOpen className="h-5 w-5" />} variant="light">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button
            onClick={() => loadDir("")}
            className="text-[#75D6A8] hover:underline font-medium"
          >
            Файлы
          </button>
          {crumbs.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-[rgba(165,187,179,0.4)]" />
              <button
                onClick={() => loadDir(crumbs.slice(0, i + 1).join("/"))}
                className="text-[rgba(220,235,230,0.8)] hover:underline"
              >
                {seg}
              </button>
            </span>
          ))}
          <span className="ml-auto font-mono text-xs text-[rgba(165,187,179,0.5)]">
            {entries.length} объектов · {formatSize(totalSize)}
          </span>
        </div>
      </AdminCard>

      {loading ? (
        <div className="h-48 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
      ) : (
        <AdminTable
          columns={[
            {
              key: "name",
              label: "Имя",
              render: (val: string, row: Entry) => (
                <button
                  onClick={() => (row.isDir ? loadDir(joinPath(cwd, val)) : openFile(joinPath(cwd, val)))}
                  className="flex items-center gap-2 text-left hover:text-[#75D6A8] transition-colors"
                >
                  {row.isDir ? <FolderOpen className="h-4 w-4 text-[#F0C040]" /> : <FileText className="h-4 w-4 text-[rgba(143,184,174,0.7)]" />}
                  <span className="font-medium text-[rgba(220,235,230,0.85)]">{val}</span>
                </button>
              ),
            },
            {
              key: "type",
              label: "Тип",
              render: (val: string) => (
                <span className="text-xs font-mono text-[rgba(143,184,174,0.6)]">
                  {val === "directory" ? "папка" : `.${val}`}
                </span>
              ),
            },
            {
              key: "size",
              label: "Размер",
              render: (v: number, row: Entry) => (
                <span className="font-mono text-xs text-[rgba(165,187,179,0.6)]">
                  {row.isDir ? "—" : formatSize(v)}
                </span>
              ),
            },
            {
              key: "modifiedAt",
              label: "Изменён",
              render: (v: string) => formatDate(v),
            },
            {
              key: "actions",
              label: "",
              render: (_: unknown, row: Entry) => (
                <button
                  onClick={() => deleteEntry(joinPath(cwd, row.name), row.isDir)}
                  className="text-[rgba(220,112,112,0.6)] hover:text-[rgba(220,112,112,0.9)] transition-colors"
                  aria-label={`Удалить ${row.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ),
            },
          ]}
          data={entries}
          emptyMessage="Папка пуста — создайте первый файл"
        />
      )}

      {/* Редактор файла */}
      <AdminModal
        isOpen={editorPath !== null}
        onClose={() => setEditorPath(null)}
        title={editorPath ?? ""}
        wide
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setEditorPath(null)}>
              Закрыть
            </GlassButton>
            <GlassButton size="sm" icon={<Save className="h-4 w-4" />} onClick={saveFile} disabled={saving || editorLoading}>
              {saving ? "Сохранение…" : "Сохранить"}
            </GlassButton>
          </>
        }
      >
        {editorLoading ? (
          <div className="h-64 rounded-xl bg-[rgba(143,184,174,0.06)] animate-pulse" />
        ) : (
          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            spellCheck={false}
            className="w-full h-[50vh] rounded-xl bg-[rgba(10,20,17,0.6)] border border-[rgba(143,184,174,0.15)] p-4 font-mono text-sm text-[rgba(220,235,230,0.9)] focus:outline-none focus:border-[rgba(117,214,168,0.4)] resize-y scroll-area"
            aria-label="Содержимое файла"
          />
        )}
      </AdminModal>

      {/* Новый файл */}
      <AdminModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="Новый файл"
        footer={
          <>
            <GlassButton size="sm" variant="ghost" onClick={() => setCreating(false)}>Отмена</GlassButton>
            <GlassButton size="sm" onClick={createFile}>Создать</GlassButton>
          </>
        }
      >
        <GlassInput
          label={`Имя файла (в папке «${cwd || "Файлы"}»)`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="например, notes.md"
        />
      </AdminModal>
    </div>
  );
}
