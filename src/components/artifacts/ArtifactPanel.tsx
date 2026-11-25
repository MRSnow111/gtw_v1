"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Check, Copy, Download, FileCode2, FileText, Folder, Inbox,
  Image as ImageIcon, TriangleAlert, X, Maximize2, Presentation, Loader2, Upload,
  PanelRightClose, PanelRightOpen, Trash2, Monitor,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agentStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore, ARTIFACT_DEFAULT_WIDTH, ARTIFACT_WIDE_WIDTH } from "@/stores/uiStore";
import type { Artifact } from "@/lib/demoData";
import { formatSize } from "@/lib/demoData";
import { detectKind } from "@/lib/fileKind";
import { GlassBadge, IconButton } from "@/components/ui/glass";
import { Markdown } from "@/lib/markdown";
import { OfficeViewer } from "@/components/artifacts/OfficeViewer";
import { LiveBrowser } from "@/components/artifacts/LiveBrowser";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/* ─────────── простая подсветка синтаксиса (без зависимостей) ─────────── */

const KEYWORDS =
  /\b(import|from|export|default|async|await|def|return|class|const|let|var|if|else|for|while|function|print|new)\b/;

function highlightLine(line: string, lang: string): React.ReactNode {
  const commentRe = lang === "python" ? /(#.*)$/ : /(\/\/.*$)/;
  const parts: React.ReactNode[] = [];
  const rest = line;
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

function CodeViewer({ content, lang }: { content: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const lines = (content || "").split("\n");

  const copy = async () => {
    await navigator.clipboard.writeText(content || "");
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
                  {highlightLine(line, lang || "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────── догрузка текстового содержимого (код/markdown) ─────────── */

function useTextContent(url: string | undefined, enabled: boolean) {
  const [state, setState] = useState({ text: "", loading: enabled, error: false });
  useEffect(() => {
    if (!enabled || !url) {
      setState({ text: "", loading: false, error: false });
      return;
    }
    let alive = true;
    setState({ text: "", loading: true, error: false });
    fetch(url, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((t) => {
        if (!alive) return;
        setState({ text: t.length > 600000 ? t.slice(0, 600000) + "\n…(обрезано)" : t, loading: false, error: false });
      })
      .catch(() => {
        if (alive) setState({ text: "", loading: false, error: true });
      });
    return () => { alive = false; };
  }, [url, enabled]);
  return state;
}

const dlUrl = (a: Artifact) =>
  a.url ? `${a.url}${a.url.includes("?") ? "&" : "?"}download=1` : undefined;

function CenterBox({ children }: { children: ReactNode }) {
  return (
    <div className="glass-light flex flex-1 flex-col items-center justify-center gap-3 rounded-xl p-6 text-center text-xs text-dim">
      {children}
    </div>
  );
}

function DownloadBox({ a }: { a: Artifact }) {
  return (
    <div className="glass-light flex flex-1 flex-col items-center justify-center gap-2 rounded-xl p-6 text-center">
      <div className="glass-medium flex h-14 w-14 items-center justify-center rounded-2xl">
        <FileText className="h-6 w-6 text-mint" />
      </div>
      <div className="mt-1 text-[13px] text-foreground">{a.name}</div>
      <div className="text-[11px] text-[rgba(220,235,230,0.6)]">
        {a.size ? `${a.size} · ` : ""}
        {new Date(a.updatedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
      </div>
      {dlUrl(a) && (
        <a
          href={dlUrl(a)}
          download={a.name}
          className="glass-medium mt-2 flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs text-foreground transition-colors hover:border-mint/40"
        >
          <Download className="h-3.5 w-3.5" /> Скачать
        </a>
      )}
    </div>
  );
}

/* ─────────── тело просмотрщика по типу файла ─────────── */

function FileBody({
  a, onConvert, onZoom, onRetry,
}: {
  a: Artifact;
  onConvert: (a: Artifact) => void;
  onZoom?: () => void;
  onRetry?: () => void;
}) {
  const needsText = a.kind === "code" || a.kind === "markdown";
  const { text, loading, error } = useTextContent(a.url, needsText);

  if (a.error) {
    return (
      <CenterBox>
        <TriangleAlert className="h-6 w-6 text-amber-300" />
        <p>Не удалось загрузить файл</p>
        {onRetry && (
          <button onClick={onRetry} className="glass-medium rounded-xl px-4 py-1.5 text-xs text-foreground transition-colors hover:border-mint/40">
            Повторить
          </button>
        )}
      </CenterBox>
    );
  }

  if (a.kind === "image") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-white/[0.08] bg-fern-950/40 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={a.url}
          alt={a.name}
          onClick={onZoom}
          className={cn("max-h-full w-full rounded-lg object-contain", onZoom && "cursor-zoom-in")}
        />
      </div>
    );
  }

  if (a.kind === "pdf") {
    return a.url ? (
      <iframe
        src={a.url}
        title={a.name}
        className="h-full min-h-0 flex-1 rounded-xl border border-white/[0.08] bg-white"
      />
    ) : (
      <DownloadBox a={a} />
    );
  }

  if (a.kind === "office") {
    return <OfficeViewer a={a} onConvert={onConvert} />;
  }

  if (needsText) {
    if (loading) {
      return (
        <CenterBox>
          <Loader2 className="h-5 w-5 animate-spin text-mint" />
          <p>Загрузка содержимого…</p>
        </CenterBox>
      );
    }
    if (error) {
      return (
        <CenterBox>
          <TriangleAlert className="h-6 w-6 text-amber-300" />
          <p>Не удалось загрузить содержимое файла</p>
        </CenterBox>
      );
    }
    if (a.kind === "markdown") {
      return (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-fern-950/40">
          <Markdown source={text} />
        </div>
      );
    }
    return <CodeViewer content={text} lang={a.lang || ""} />;
  }

  return <DownloadBox a={a} />;
}

/* ─────────── панель ─────────── */

export function ArtifactPanel({ className }: { className?: string }) {
  const { artifacts, activeChatId, retryArtifact, removeArtifact, sendMessage, chats } = useAgentStore();
  const projects = useProjectStore((s) => s.projects);
  const artifactWidth = useUiStore((s) => s.artifactWidth);
  const toggleArtifactWide = useUiStore((s) => s.toggleArtifactWide);
  const isWide = artifactWidth >= (ARTIFACT_DEFAULT_WIDTH + ARTIFACT_WIDE_WIDTH) / 2;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [tab, setTab] = useState<"artifacts" | "project">("artifacts");
  const [liveOpen, setLiveOpen] = useState(false);
  const [projectFiles, setProjectFiles] = useState<Artifact[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<Artifact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeProjectId = chats.find((c) => c.id === activeChatId)?.projectId ?? null;
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const chatArtifacts = useMemo(
    () => artifacts.filter((a) => a.chatId === activeChatId),
    [artifacts, activeChatId]
  );

  const loadProjectFiles = useCallback(async (pid: string) => {
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/files?project_id=${encodeURIComponent(pid)}`);
      if (res.ok) {
        const data = await res.json();
        const items: Artifact[] = (data.files || []).map(
          (f: { id: string; name: string; mime: string; size: number; created_at: string }) => {
            const { kind, lang } = detectKind(f.name, f.mime);
            return {
              id: f.id, chatId: activeChatId || "", name: f.name, kind, lang,
              size: f.size ? formatSize(f.size) : "", sizeBytes: f.size,
              updatedAt: f.created_at, url: `/api/files/${f.id}`, mime: f.mime, fileId: f.id,
            };
          }
        );
        setProjectFiles(items);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingFiles(false);
    }
  }, [activeChatId]);

  useEffect(() => {
    if (tab === "project" && activeProjectId) loadProjectFiles(activeProjectId);
  }, [tab, activeProjectId, loadProjectFiles]);

  // смена чата — сброс вкладки и выбора
  useEffect(() => {
    setTab("artifacts");
    setSelectedId(null);
  }, [activeChatId]);

  // Как у Claude: новый файл агента автоматически открывает предпросмотр в панели.
  // На маунте/смене чата существующие артефакты не открываем — только свежие.
  const seenArtifactsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seenArtifactsRef.current === null) {
      seenArtifactsRef.current = new Set(artifacts.map((a) => a.id));
      return;
    }
    const seen = seenArtifactsRef.current;
    const fresh = artifacts.filter((a) => !seen.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => seen.add(a.id));
    // не прерываем полноэкранный просмотр / лайтбокс
    if (viewerOpen || lightbox) return;
    const forActive = fresh.filter((a) => a.chatId === activeChatId);
    if (forActive.length) {
      setTab("artifacts");
      setSelectedId(forActive[0].id);
    }
  }, [artifacts, activeChatId, viewerOpen, lightbox]);

  const list = tab === "project" ? projectFiles : chatArtifacts;
  const selected =
    list.find((a) => a.id === selectedId) || chatArtifacts.find((a) => a.id === selectedId) || null;

  const switchTab = (t: "artifacts" | "project") => {
    setTab(t);
    setSelectedId(null);
  };

  const uploadProjectFile = async (file: File) => {
    if (!activeProjectId) return;
    const form = new FormData();
    form.append("file", file);
    form.append("chat_id", activeChatId || "");
    form.append("project_id", activeProjectId);
    try {
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (res.ok) {
        toast.success("Файл загружен в проект");
        loadProjectFiles(activeProjectId);
      } else {
        toast.error("Не удалось загрузить файл");
      }
    } catch {
      toast.error("Не удалось загрузить файл");
    }
  };

  useEffect(() => {
    if (!lightbox && !viewerOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightbox(false);
        setViewerOpen(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [lightbox, viewerOpen]);

  const convertToPdf = (a: Artifact) => {
    const chatId = a.chatId || activeChatId;
    if (!chatId) {
      toast.error("Нет активного чата для конвертации");
      return;
    }
    const text =
      `Сконвертируй офисный файл «${a.name}» в PDF и пришли мне готовый PDF-файл. ` +
      `Этот файл относится к нашему чату (ты создал его или получил как вложение) — найди его в своём рабочем каталоге ` +
      `и выполни конвертацию командой: soffice --headless --convert-to pdf --outdir . <путь к файлу>. ` +
      `Затем отправь готовый PDF-файл.`;
    sendMessage(chatId, text);
    toast.info("Запросил конвертацию в PDF — агент пришлёт файл в чат");
  };

  const confirmDelete = async () => {
    const a = pendingDelete;
    if (!a || deleting) return;
    setDeleting(true);
    try {
      // файл с сервера удаляем только если он зарегистрирован в сторе (fileId)
      if (a.fileId) {
        const res = await fetch(`/api/files/${encodeURIComponent(a.fileId)}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404) {
          toast.error("Не удалось удалить файл");
          return;
        }
      }
      removeArtifact(a.id);
      setProjectFiles((pf) => pf.filter((x) => x.id !== a.id));
      if (selectedId === a.id) {
        setSelectedId(null);
        setViewerOpen(false);
        setLightbox(false);
      }
      toast.success(a.fileId ? "Файл удалён" : "Артефакт убран из панели");
      setPendingDelete(null);
    } catch {
      toast.error("Не удалось удалить файл");
    } finally {
      setDeleting(false);
    }
  };

  const kindIcon = (a: Artifact) =>
    a.kind === "code" ? FileCode2 : a.kind === "image" ? ImageIcon : a.kind === "office" ? Presentation : FileText;

  return (
    <div className={cn("glass-strong relative flex h-full flex-col overflow-hidden", className)}>
      {/* шапка */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
        {selected ? (
          <>
            <IconButton onClick={() => setSelectedId(null)} aria-label="Назад">
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{selected.name}</span>
            {dlUrl(selected) && (
              <a
                href={dlUrl(selected)}
                download={selected.name}
                aria-label="Скачать файл"
                title="Скачать файл"
                className="glass-light inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-dim transition-all duration-200 hover:border-mint/40 hover:text-foreground hover:shadow-[0_0_16px_rgba(143,184,174,0.2)] active:scale-95"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
            <IconButton onClick={() => setViewerOpen(true)} aria-label="Открыть">
              <Maximize2 className="h-4 w-4" />
            </IconButton>
            <IconButton
              onClick={() => setPendingDelete(selected)}
              aria-label="Удалить файл"
              title="Удалить файл"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </>
        ) : activeProject ? (
          <div className="flex flex-1 items-center gap-1">
            <button
              onClick={() => switchTab("artifacts")}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] transition-colors",
                tab === "artifacts" ? "bg-mint/18 text-foreground" : "text-dim hover:text-foreground"
              )}
            >
              Артефакты <span className="tabular-nums opacity-70">{chatArtifacts.length}</span>
            </button>
            <button
              onClick={() => switchTab("project")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-[12px] transition-colors",
                tab === "project" ? "bg-mint/18 text-foreground" : "text-dim hover:text-foreground"
              )}
              title={`Файлы проекта «${activeProject.name}»`}
            >
              <Folder className="h-3 w-3 shrink-0" />
              <span className="max-w-[90px] truncate">{activeProject.name}</span>
              <span className="tabular-nums opacity-70">{projectFiles.length}</span>
            </button>
            {loadingFiles && <Loader2 className="h-3.5 w-3.5 animate-spin text-mint" />}
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              aria-label="Загрузить файл в проект"
              title="Загрузить файл в проект"
            >
              <Upload className="h-4 w-4" />
            </IconButton>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadProjectFile(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <>
            <span className="flex-1 pl-1 text-sm text-mint-soft">Артефакты</span>
            <GlassBadge>{list.length}</GlassBadge>
          </>
        )}
        </div>
        <IconButton
          onClick={() => setLiveOpen((v) => !v)}
          active={liveOpen}
          aria-label={liveOpen ? "Закрыть браузер" : "Браузер агента (live)"}
          title={liveOpen ? "Закрыть live-браузер" : "Браузер агента (live)"}
        >
          <Monitor className="h-4 w-4" />
        </IconButton>
        <IconButton
          onClick={toggleArtifactWide}
          aria-label={isWide ? "Сузить панель" : "Расширить панель"}
          title={isWide ? "Сузить панель артефактов" : "Расширить панель артефактов"}
        >
          {isWide ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </IconButton>
      </div>

      {liveOpen ? (
        <LiveBrowser chatId={activeChatId} />
      ) : selected ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <FileBody
            a={selected}
            onConvert={convertToPdf}
            onZoom={() => setLightbox(true)}
            onRetry={() => retryArtifact(selected.id)}
          />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Inbox className="h-7 w-7 text-[rgba(220,235,230,0.52)]" />
          <p className="text-xs leading-relaxed text-[rgba(220,235,230,0.6)]">
            {tab === "project"
              ? "Загрузите файлы проекта кнопкой выше или дождитесь результатов агента"
              : "Здесь будут результаты работы агента"}
          </p>
        </div>
      ) : (
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
          {list.map((a) => {
            const Icon = kindIcon(a);
            return (
              <div
                key={a.id}
                className="group mb-0.5 flex w-full items-center gap-1 rounded-xl pr-1.5 transition-colors hover:bg-white/[0.05]"
              >
                <button
                  onClick={() => setSelectedId(a.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
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
                      {a.size ? `${a.size} · ` : ""}
                      {new Date(a.updatedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </button>
                {dlUrl(a) && (
                  <a
                    href={dlUrl(a)}
                    download={a.name}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Скачать ${a.name}`}
                    title="Скачать файл"
                    className="glass-light flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-dim opacity-0 transition-all hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(a);
                  }}
                  aria-label={`Удалить ${a.name}`}
                  title="Удалить файл"
                  className="glass-light flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-dim opacity-0 transition-all hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* полноразмерный просмотр изображения (lightbox) */}
      <AnimatePresence>
        {lightbox && selected?.url && (
          <motion.div
            key="lightbox"
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

      {/* полноэкранный просмотрщик («Открыть») */}
      <AnimatePresence>
        {viewerOpen && selected && (
          <motion.div
            key="fullscreen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] flex flex-col bg-fern-950 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{selected.name}</span>
              {dlUrl(selected) && (
                <a
                  href={dlUrl(selected)}
                  download={selected.name}
                  className="glass-light flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] text-dim transition-colors hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" /> Скачать
                </a>
              )}
              <button
                onClick={() => setPendingDelete(selected)}
                aria-label="Удалить файл"
                className="glass-light flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] text-dim transition-colors hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" /> Удалить
              </button>
              <IconButton onClick={() => setViewerOpen(false)} aria-label="Закрыть (Esc)">
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <FileBody a={selected} onConvert={convertToPdf} onRetry={() => retryArtifact(selected.id)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Удалить файл?"
        description={
          pendingDelete
            ? `«${pendingDelete.name}» будет удалён безвозвратно${pendingDelete.fileId ? " с сервера" : " из панели"}.`
            : undefined
        }
        confirmLabel={deleting ? "Удаление…" : "Удалить"}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
      />
    </div>
  );
}