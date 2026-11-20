"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTable } from "@/components/admin/AdminTable";
import { FolderOpen, ArrowUpRight } from "lucide-react";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 Б";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
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

export default function AdminFilesPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/files")
      .then((r) => r.json())
      .then(setFiles)
      .finally(() => setLoading(false));
  }, []);

  const typeIcons: Record<string, string> = {
    directory: "📁",
    yaml: "📝",
    json: "📋",
    database: "🗄️",
    archive: "📦",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Файлы</h1>
        <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
          Управление файлами gateway
        </p>
      </div>

      <AdminCard
        title="Общее пространство"
        icon={<FolderOpen className="h-5 w-5" />}
        variant="light"
      >
        <div className="text-2xl font-bold text-[rgba(220,235,230,0.9)]">
          {files.reduce((sum, f) => sum + f.size, 0) > 1024 * 1024
            ? `${(files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(1)} МБ`
            : `${files.reduce((sum, f) => sum + f.size, 0) / 1024} КБ`}
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
              render: (val: string, row: any) => (
                <div className="flex items-center gap-2">
                  <span>{typeIcons[row.type] || "📄"}</span>
                  <span className="font-medium text-[rgba(220,235,230,0.85)]">{val}</span>
                </div>
              ),
            },
            {
              key: "type",
              label: "Тип",
              render: (val: string) => (
                <span className="text-xs font-mono text-[rgba(143,184,174,0.6)]">
                  {val === "directory" ? "📁 папка" : `.${val}`}
                </span>
              ),
            },
            {
              key: "size",
              label: "Размер",
              render: (v: number) => (
                <span className="font-mono text-xs text-[rgba(165,187,179,0.6)]">
                  {formatSize(v)}
                </span>
              ),
            },
            {
              key: "modifiedAt",
              label: "Изменён",
              render: (v: string) => formatDate(v),
            },
            {
              key: "action",
              label: "",
              render: (_: any, row: any) =>
                row.type !== "directory" ? (
                  <button className="text-[rgba(143,184,174,0.5)] hover:text-[rgba(143,184,174,0.8)] transition-colors">
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                ) : null,
            },
          ]}
          data={files}
          emptyMessage="Нет файлов"
        />
      )}
    </div>
  );
}
