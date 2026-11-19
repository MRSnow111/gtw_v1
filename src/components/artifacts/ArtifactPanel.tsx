"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Check, Copy, Download, FileCode2, FileText, Inbox,
  Image as ImageIcon, Maximize2, TriangleAlert, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agentStore";
import type { Artifact } from "@/lib/demoData";
import { GlassBadge, IconButton } from "@/components/ui/glass";

/* ─────────── простая подсветка синтаксиса (без зависимостей) ─────────── */

const KEYWORDS =
  /\b(import|from|export|default|async|await|def|return|class|const|let|var|if|else|for|while|function|print|new)\b/;

function highlightLine(line: string, lang: string): React.ReactNode {
  const commentRe = lang === "python" ? /(#.*)$/ : /(\/\/.*$)/;
  const parts: React.ReactNode[] = [];
  let rest = line;
  let key = 0;

  const pushPlain = (text: string) => {
    if (!text) return;
    const tokenRe = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b)/g;
    let m: RegExpExecArray | null;
    let last = 0;
    while ((m = tokenRe.exec(text))) {
      if (m.index > last) pushKeywords(text.slice(last, m.index));
      parts.push(
        <span key={key++} className="text-emerald-300/80">{m[0]}</span>
      );
      last = m.index + m[0].length;
    }
    pushKeywords(text.slice(last));
  };

  const pushKeywords = (text: string) => {
    const kw = new RegExp(KEYWORDS.source, "g");
    let m: RegExpExecArray | null;
    let last = 0;
    while ((m = kw.exec(text))) {
      if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
      parts.push(<span key={key++} className="text-mint">{m[0]}</span>);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  };

  const cm = commentRe.exec(rest);
  if (cm && cm.index !== undefined) {
    pushPlain(rest.slice(0, cm.index));
    parts.push(<span key={key++} className="italic text-[rgba(220,235,230,0.52)]">{cm[0]}</span>);
  } else {
    pushPlain(rest);
  }
  return parts;
}

/* ─────────── просмотрщик кода ─────────── */

function CodeViewer({ artifact }: { artifact: Artifact }) {
  const [copied, setCopied] = useState(false);
  const lines = (artifact.content || "").split("\n");

  const copy = async () => {
    await navigator.clipboard.writeText(artifact.content || "");
    setCopied(true);
    toast.success("Скопировано");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-fern-950/60">
      <button
        onClick={copy}
        className="glass-light absolute right-2 top-2 z-10 flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-dim hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        {copied ? "Скопировано" : "Копировать"}
      </button>
      <div className="scroll-area h-full overflow-auto p-3">
        <table className="w-full border-collapse font-mono text-[11.5px] leading-[1.7]">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="w-8 select-none pr-3 text-right align-top text-[rgba(220,235,230,0.58)]">
                  {i + 1}
                </td>
                <td className="whitespace-pre-wrap break-words text-[rgba(220,235,230,0.95)]">
                  {highlightLine(line, artifact.lang || "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────── панель ─────────── */

export function ArtifactPanel({ className }: { className?: string }) {
  const { artifacts, activeChatId, retryArtifact } = useAgentStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const list = useMemo(
    () => artifacts.filter((a) => a.chatId === activeChatId),
    [artifacts, activeChatId]
  );
  const selected = list.find((a) => a.id === selectedId) || null;

  useEffect(() => {
    if (!lightbox) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [lightbox]);

  const kindIcon = (a: Artifact) =>
    a.kind === "code" ? FileCode2 : a.kind === "image" ? ImageIcon : FileText;

  return (
    <div className={cn("glass-strong relative flex h-full flex-col overflow-hidden", className)}>
      {/* шапка */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        {selected ? (
          <IconButton onClick={() => setSelectedId(null)} aria-label="Назад">
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
        ) : (
          <span className="flex-1 pl-1 text-sm text-mint-soft">Артефакты</span>
        )}
        {!selected && <GlassBadge>{list.length}</GlassBadge>}
        <IconButton
          onClick={() => toast.info("Отдельное окно появится вместе с бэкендом")}
          aria-label="Открыть отдельно"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <div className="mb-2 truncate px-1 text-[12px] text-dim">{selected.name}</div>
          {selected.error ? (
            <div className="glass-light flex flex-1 flex-col items-center justify-center gap-3 rounded-xl p-6 text-center">
              <TriangleAlert className="h-6 w-6 text-amber-300" />
              <p className="text-xs text-dim">Не удалось загрузить файл</p>
              <button
                onClick={() => retryArtifact(selected.id)}
                className="glass-medium rounded-xl px-4 py-1.5 text-xs text-foreground transition-colors hover:border-mint/40"
              >
                Повторить
              </button>
            </div>
          ) : selected.kind === "code" ? (
            <CodeViewer artifact={selected} />
          ) : selected.kind === "image" ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-white/[0.08] bg-fern-950/40 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.url}
                alt={selected.name}
                onClick={() => setLightbox(true)}
                className="max-h-full w-full cursor-zoom-in rounded-lg object-contain"
              />
            </div>
          ) : (
            <div className="glass-light flex flex-1 flex-col items-center justify-center gap-2 rounded-xl p-6 text-center">
              <div className="glass-medium flex h-14 w-14 items-center justify-center rounded-2xl">
                <FileText className="h-6 w-6 text-mint" />
              </div>
              <div className="mt-1 text-[13px] text-foreground">{selected.name}</div>
              <div className="text-[11px] text-[rgba(220,235,230,0.6)]">
                {selected.size} · {new Date(selected.updatedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <button
                onClick={() => toast.info("Скачивание появится вместе с бэкендом")}
                className="glass-medium mt-2 flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs text-foreground transition-colors hover:border-mint/40"
              >
                <Download className="h-3.5 w-3.5" /> Скачать
              </button>
            </div>
          )}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Inbox className="h-7 w-7 text-[rgba(220,235,230,0.52)]" />
          <p className="text-xs leading-relaxed text-[rgba(220,235,230,0.6)]">
            Здесь будут результаты работы агента
          </p>
        </div>
      ) : (
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
          {list.map((a) => {
            const Icon = kindIcon(a);
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className="group mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
              >
                <div className="glass-light flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="h-4 w-4 text-mint" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-dim group-hover:text-foreground">
                      {a.name}
                    </span>
                    {a.error && <TriangleAlert className="h-3 w-3 shrink-0 text-amber-300" />}
                  </div>
                  <div className="text-[11px] text-[rgba(220,235,230,0.6)]">
                    {a.size} · {new Date(a.updatedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* полноразмерный просмотр изображения */}
      <AnimatePresence>
        {lightbox && selected?.url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-fern-950/85 p-8 backdrop-blur-sm"
            onClick={() => setLightbox(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img
              src={selected.url}
              alt={selected.name}
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="max-h-full max-w-full rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="glass-light absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full text-dim hover:text-foreground"
              onClick={() => setLightbox(false)}
              aria-label="Закрыть (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
