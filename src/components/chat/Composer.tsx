"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowUp, FileText, Paperclip, Square, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWsStore } from "@/stores/wsStore";
import { useAgentStore, DEMO_MODE } from "@/stores/agentStore";
import { useUiStore } from "@/stores/uiStore";
import { formatSize, type UserAttachment } from "@/lib/demoData";

interface ComposerProps {
  chatId: string | null;
}

const MAX_LINES = 7;
const LINE_H = 20;
const MAX_FILE_MB = 25;
const MAX_FILES = 10;

export function Composer({ chatId }: ComposerProps) {
  const router = useRouter();
  const status = useWsStore((s) => s.status);
  const commands = useAgentStore((s) => s.commands);
  const running = useAgentStore((s) => {
    if (!chatId) return false;
    const turns = s.turnsByChat[chatId];
    const last = turns?.[turns.length - 1];
    return last?.kind === "agent" && last.agentState === "running";
  });

  const { composerFocusTick } = useUiStore();

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<UserAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [cmdIndex, setCmdIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const offline = status !== "connected";
  const readyAtts = attachments.filter((a) => a.status === "ready");
  const uploading = attachments.some((a) => a.status === "uploading");

  /* фокус из welcome-карточек */
  useEffect(() => {
    if (composerFocusTick > 0) textareaRef.current?.focus();
  }, [composerFocusTick]);

  /* автораст */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_LINES * LINE_H + 28)}px`;
  }, [text]);

  const showCommands =
    text.startsWith("/") && !text.includes(" ") && commands.length > 0;
  const filteredCommands = showCommands
    ? commands.filter((c) => c.name.startsWith(text.toLowerCase()))
    : [];

  useEffect(() => setCmdIndex(0), [text]);

  const pickCommand = (name: string) => {
    setText(name + " ");
    textareaRef.current?.focus();
  };

  const doSend = () => {
    const trimmed = text.trim();
    const ready = attachments.filter((a) => a.status === "ready" && a.fileId);
    const isUploading = attachments.some((a) => a.status === "uploading");
    if ((!trimmed && ready.length === 0) || running || isUploading) return;
    setText("");
    setAttachments([]);
    const store = useAgentStore.getState();
    if (chatId) {
      store.sendMessage(chatId, trimmed, ready);
    } else {
      const id = store.startChatWithMessage(trimmed, ready);
      store.setActiveChat(id);
      router.push(`/chat/${id}`);
    }
  };

  const doStop = () => {
    const store = useAgentStore.getState();
    let id: string | null | undefined = chatId;
    if (!id) {
      // первое сообщение с welcome-экрана: переход на /chat/[id] ещё мог не завершиться
      id = Object.entries(store.turnsByChat).find(([, ts]) =>
        ts.some((t) => t.kind === "agent" && t.agentState === "running")
      )?.[0];
    }
    if (id) store.stop(id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCmdIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCmdIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        pickCommand(filteredCommands[cmdIndex].name);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  const updateAtt = (key: string, patch: Partial<UserAttachment>) =>
    setAttachments((a) => a.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  /* реальная загрузка файлов (live): POST /api/files, прогресс через XHR */
  const uploadFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    const room = MAX_FILES - attachments.length;
    if (room <= 0) {
      toast.error(`Не более ${MAX_FILES} файлов за раз`);
      return;
    }
    for (const file of arr.slice(0, room)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`«${file.name}» больше ${MAX_FILE_MB} МБ`);
        continue;
      }
      if (file.size === 0) {
        toast.error(`«${file.name}» пустой`);
        continue;
      }
      const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const att: UserAttachment = {
        key, name: file.name, size: formatSize(file.size),
        status: "uploading", progress: 0, mime: file.type || undefined, sizeBytes: file.size,
      };
      setAttachments((a) => [...a, att]);
      const form = new FormData();
      form.append("file", file);
      if (chatId) form.append("chat_id", chatId);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) updateAtt(key, { progress: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const d = JSON.parse(xhr.responseText);
            updateAtt(key, {
              fileId: d.id, url: d.url, mime: d.mime, sizeBytes: d.size,
              name: d.name, size: formatSize(d.size), status: "ready", progress: 100,
            });
          } catch {
            updateAtt(key, { status: "failed" });
            toast.error("Не удалось разобрать ответ сервера");
          }
        } else {
          updateAtt(key, { status: "failed" });
          let msg = `Ошибка загрузки (${xhr.status})`;
          try {
            const d = JSON.parse(xhr.responseText);
            if (d.code === "too_large") msg = `Файл больше ${MAX_FILE_MB} МБ`;
            else if (d.code === "unauthorized") msg = "Сессия истекла — войдите снова";
            else if (d.code === "empty_file") msg = "Файл пустой";
          } catch { /* ignore */ }
          toast.error(msg);
        }
      };
      xhr.onerror = () => {
        updateAtt(key, { status: "failed" });
        toast.error("Сеть недоступна при загрузке");
      };
      xhr.send(form);
    }
  };

  /* загрузка файлов: live — реальный выбор файла, демо — имитация */
  const addFile = () => {
    if (!DEMO_MODE) {
      fileInputRef.current?.click();
      return;
    }
    const n = attachments.length + 1;
    const att: UserAttachment = {
      name: `document_${n}.pdf`,
      size: `${(Math.random() * 2 + 0.3).toFixed(1)} МБ`,
      status: "uploading",
      progress: 0,
    };
    setAttachments((a) => [...a, att]);
    const iv = window.setInterval(() => {
      setAttachments((a) =>
        a.map((x) =>
          x === att
            ? x.progress === null || x.progress === undefined
              ? x
              : { ...x, progress: Math.min(100, x.progress + 18) }
            : x
        )
      );
    }, 180);
    window.setTimeout(() => {
      window.clearInterval(iv);
      setAttachments((a) =>
        a.map((x) => (x === att ? { ...x, status: "ready", progress: 100 } : x))
      );
      toast.success("Файл загружен");
    }, 1400);
  };

  const generating = running;

  return (
    <div className="relative shrink-0 px-4 pb-4 pt-1">
      <div className="mx-auto w-full max-w-3xl">
        {/* офлайн-плашка */}
        {offline && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-medium mb-2 flex items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-[11.5px] text-amber-200/90"
          >
            Соединение потеряно. Переподключение…
          </motion.div>
        )}

        {/* меню команд */}
        <AnimatePresence>
          {showCommands && filteredCommands.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="glass-strong absolute bottom-full left-0 right-0 z-20 mx-auto mb-2 w-80 rounded-2xl p-1.5"
              style={{ background: "linear-gradient(135deg, rgba(23,46,42,0.985), rgba(13,28,25,0.99))" }}
            >
              {filteredCommands.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => pickCommand(c.name)}
                  onMouseEnter={() => setCmdIndex(i)}
                  className={cn(
                    "flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors",
                    i === cmdIndex ? "bg-mint/15" : "hover:bg-white/[0.05]"
                  )}
                >
                  <span className="font-mono text-[12.5px] text-mint">{c.name}</span>
                  <span className="text-[11px] text-[rgba(220,235,230,0.62)]">
                    {c.description}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* композер */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (DEMO_MODE) addFile();
            else if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
          }}
          className={cn(
            "glass-medium relative rounded-[24px] p-3 transition-all duration-200",
            dragOver && "border-mint/60 bg-mint/[0.07] shadow-[0_0_32px_rgba(143,184,174,0.25)]"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* чипы вложений */}
          {attachments.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {attachments.map((a, i) => (
                <div
                  key={a.key || i}
                  className={cn(
                    "glass-light relative flex items-center gap-2 overflow-hidden rounded-lg px-2.5 py-1.5",
                    a.status === "failed" && "border-red-400/40 bg-red-500/10"
                  )}
                >
                  <FileText
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      a.status === "failed" ? "text-red-300" : "text-mint"
                    )}
                  />
                  <span className="text-[11.5px] text-dim">{a.name}</span>
                  <span className="text-[10.5px] text-[rgba(220,235,230,0.6)]">{a.size}</span>
                  <button
                    onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                    className="text-[rgba(220,235,230,0.62)] hover:text-foreground"
                    aria-label="Убрать файл"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {a.status === "uploading" && (
                    <div
                      className="absolute bottom-0 left-0 h-[2px] bg-mint transition-all duration-150"
                      style={{ width: `${a.progress || 0}%` }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Напишите сообщение…"
            className="scroll-area block max-h-[168px] w-full resize-none bg-transparent px-1 py-1.5 text-[14px] leading-[20px] outline-none placeholder:text-[rgba(220,235,230,0.52)]"
          />

          <div className="mt-1 flex items-center justify-between">
            <div className="flex gap-1">
              <button
                onClick={addFile}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[rgba(220,235,230,0.7)] transition-colors hover:bg-white/[0.06] hover:text-foreground"
                aria-label="Прикрепить файл"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </div>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={generating ? doStop : doSend}
              disabled={!generating && ((!text.trim() && readyAtts.length === 0) || offline || uploading)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                generating
                  ? "bg-red-400/90 text-white hover:bg-red-400"
                  : "gradient-primary text-fern-950 hover:shadow-[0_0_32px_rgba(94,208,174,0.55)]",
                "disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
              )}
              aria-label={generating ? "Остановить" : "Отправить"}
            >
              {generating ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-4 w-4" />}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
