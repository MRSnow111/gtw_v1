"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Ban, Brain, Check, CheckCheck, ChevronDown, ChevronRight, Clock3, Copy,
  FileCode2, FileSearch, FileText, Globe, HelpCircle, Loader2,
  ShieldAlert, Terminal, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Approval, ToolCall, Turn } from "@/lib/demoData";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { useAgentStore } from "@/stores/agentStore";
import { useAuthStore } from "@/stores/authStore";

/* ─────────── ход пользователя ─────────── */

export function UserTurn({ turn }: { turn: Turn }) {
  const [hoverActions, setHoverActions] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col items-end gap-1"
      onMouseEnter={() => setHoverActions(true)}
      onMouseLeave={() => setHoverActions(false)}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl rounded-br-lg border px-4 py-2.5",
          turn.status === "error"
            ? "border-red-400/40 bg-red-500/10"
            : "border-mint/25 bg-mint/[0.13]"
        )}
      >
        <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
          {turn.text}
        </div>
        {turn.attachments && turn.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.attachments.map((a, i) => (
              <span
                key={i}
                className="glass-light flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-dim"
              >
                <FileText className="h-3 w-3 text-mint" />
                {a.name}
                <span className="text-[rgba(220,235,230,0.6)]">{a.size}</span>
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 flex justify-end">
          {turn.status === "pending" ? (
            <Loader2 className="h-3 w-3 animate-spin text-[rgba(220,235,230,0.6)]" />
          ) : turn.status === "error" ? (
            <X className="h-3 w-3 text-red-300" />
          ) : (
            <CheckCheck className="h-3 w-3 text-[rgba(220,235,230,0.6)]" />
          )}
        </div>
      </div>

      {/* действия при наведении */}
      <div
        className={cn(
          "flex gap-1 pr-1 transition-opacity duration-200",
          hoverActions ? "opacity-100" : "opacity-0"
        )}
      >
        <button
          onClick={() => {
            navigator.clipboard.writeText(turn.text || "");
            toast.success("Скопировано");
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[rgba(220,235,230,0.6)] hover:bg-white/[0.06] hover:text-foreground"
        >
          <Copy className="h-3 w-3" /> Копировать
        </button>
      </div>
    </motion.div>
  );
}

/* ─────────── tool-вызов ─────────── */

const toolIcon: Record<string, typeof Terminal> = {
  terminal: Terminal,
  "fs.read": FileSearch,
  "fs.write": FileCode2,
  web: Globe,
};

function ToolRow({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(call.status === "error");
  const [showAll, setShowAll] = useState(false);
  const Icon = toolIcon[call.tool] ?? Terminal;

  const lines = call.output.split("\n");
  const visible = showAll ? lines : lines.slice(0, 30);

  const statusEl =
    call.status === "running" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-mint" />
    ) : call.status === "ok" ? (
      <Check className="h-3.5 w-3.5 text-emerald-400" />
    ) : call.status === "error" ? (
      <X className="h-3.5 w-3.5 text-red-400" />
    ) : (
      <Ban className="h-3.5 w-3.5 text-[rgba(220,235,230,0.6)]" />
    );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-colors",
        call.status === "error"
          ? "border-red-400/25 border-l-2 border-l-red-400/70 bg-red-500/[0.06]"
          : "glass-light"
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <div className="glass-light flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
          <Icon className="h-3 w-3 text-mint" />
        </div>
        <span className="text-[12.5px] font-medium text-foreground">{call.tool}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[rgba(220,235,230,0.62)]">
          {call.arg}
        </span>
        {statusEl}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-[rgba(220,235,230,0.52)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[rgba(220,235,230,0.52)]" />
        )}
      </button>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="border-t border-white/[0.06] px-3.5 py-2.5">
            {call.argsFull && (
              <div className="mb-2 font-mono text-[11px] text-[rgba(220,235,230,0.66)]">
                <span className="text-mint/70">$</span> {call.argsFull}
              </div>
            )}
            {call.output ? (
              <pre className="scroll-area max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] leading-[1.65] text-[rgba(220,235,230,0.95)]">
                {visible.join("\n")}
              </pre>
            ) : (
              <div className="text-[11.5px] text-[rgba(220,235,230,0.52)]">Вывода пока нет…</div>
            )}
            {!showAll && lines.length > 30 && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-2 text-[11px] text-mint underline decoration-mint/30 underline-offset-2 hover:decoration-mint"
              >
                Показать всё ({lines.length} строк)
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─────────── approval ─────────── */

const CHOICE_RU: Record<string, string> = {
  once: "Разрешить",
  session: "В этой сессии",
  always: "Всегда",
  deny: "Отклонить",
};

export function ApprovalBlock({ turn, chatId }: { turn: Turn; chatId: string }) {
  const decide = useAgentStore((s) => s.decide);
  const ap = turn.approval as Approval;
  if (!ap) return null;

  if (ap.state === "pending") {
    const actions = ap.actions?.length
      ? ap.actions
      : [
          { label: "Разрешить", choice: "once" },
          { label: "Отклонить", choice: "deny" },
        ];
    const primary = actions.find((a) => a.choice === "once") || actions.find((a) => a.choice !== "deny");
    const rest = actions.filter((a) => a !== primary);
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.07] p-4 shadow-[inset_0_1px_0_rgba(251,191,36,0.1)]"
      >
        <div className="mb-2.5 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-300" />
          <span className="text-[13px] font-medium text-amber-200/90">
            Агент просит разрешения выполнить…
          </span>
        </div>
        <pre className="scroll-area overflow-x-auto rounded-xl border border-white/[0.08] bg-fern-950/60 p-3 font-mono text-[12px] text-[rgba(220,235,230,0.95)]">
          {ap.command}
        </pre>
        {ap.description && (
          <p className="mt-2 text-[12px] leading-relaxed text-[rgba(220,235,230,0.66)]">{ap.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {primary && (
            <button
              onClick={() => decide(chatId, turn.id, ap.id, primary.choice)}
              className="min-w-[140px] flex-1 rounded-xl bg-mint py-2 text-[13px] font-medium text-fern-950 transition-all hover:shadow-[0_0_20px_rgba(143,184,174,0.35)]"
            >
              {CHOICE_RU[primary.choice] || primary.label}
            </button>
          )}
          {rest.map((a) => (
            <button
              key={a.choice}
              onClick={() => decide(chatId, turn.id, ap.id, a.choice)}
              className={cn(
                "rounded-xl border px-4 py-2 text-[13px] transition-colors",
                a.choice === "deny"
                  ? "border-white/[0.12] text-dim hover:bg-white/[0.06] hover:text-foreground"
                  : "border-mint/25 text-mint hover:bg-mint/[0.08]"
              )}
            >
              {CHOICE_RU[a.choice] || a.label}
            </button>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]",
        ap.state === "allowed"
          ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200/90"
          : ap.state === "denied"
            ? "border-white/[0.1] bg-white/[0.03] text-[rgba(220,235,230,0.66)]"
            : "border-amber-300/25 bg-amber-400/[0.05] text-amber-200/70"
      )}
    >
      {ap.state === "allowed" ? (
        <>
          <Check className="h-3.5 w-3.5" /> Разрешено юзером
        </>
      ) : ap.state === "denied" ? (
        <>
          <X className="h-3.5 w-3.5" /> Отклонено
        </>
      ) : (
        <>
          <Clock3 className="h-3.5 w-3.5" /> Срок истёк
        </>
      )}
      {ap.comment && (
        <span className="truncate text-[rgba(220,235,230,0.58)]">— «{ap.comment}»</span>
      )}
    </div>
  );
}

/* ─────────── clarify (вопрос агента) ─────────── */

export function ClarifyBlock({ turn, chatId }: { turn: Turn; chatId: string }) {
  const answerClarify = useAgentStore((s) => s.answerClarify);
  const cl = turn.clarify;
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  if (!cl) return null;

  if (cl.state === "answered") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-mint/25 bg-mint/[0.06] px-3 py-2 text-[12px] text-mint">
        <Check className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Ответ: {cl.answer}</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-sky-300/30 bg-sky-400/[0.07] p-4 shadow-[inset_0_1px_0_rgba(125,211,252,0.1)]"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-sky-300" />
        <span className="text-[13px] font-medium text-sky-200/90">Агент уточняет</span>
      </div>
      <div className="text-[13px] leading-relaxed text-foreground">{cl.question}</div>

      {cl.choices.length === 0 ? (
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) answerClarify(chatId, turn.id, cl.id, text.trim());
            }}
            placeholder="Ваш ответ…"
            className="glass-light flex-1 rounded-xl px-3 py-2 text-[12.5px] outline-none placeholder:text-[rgba(220,235,230,0.52)] focus:border-mint/40"
          />
          <button
            disabled={!text.trim()}
            onClick={() => answerClarify(chatId, turn.id, cl.id, text.trim())}
            className="rounded-xl bg-mint px-4 py-2 text-[13px] font-medium text-fern-950 disabled:opacity-40"
          >
            Ответить
          </button>
        </div>
      ) : cl.multiSelect ? (
        <>
          <div className="mt-3 flex flex-col gap-1.5">
            {cl.choices.map((c) => (
              <label
                key={c}
                className="glass-light flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-foreground"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(c)}
                  onChange={() =>
                    setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))
                  }
                  className="accent-mint"
                />
                {c}
              </label>
            ))}
          </div>
          <button
            disabled={selected.length === 0}
            onClick={() => answerClarify(chatId, turn.id, cl.id, selected.join(", "))}
            className="mt-3 w-full rounded-xl bg-mint py-2 text-[13px] font-medium text-fern-950 disabled:opacity-40"
          >
            Ответить
          </button>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {cl.choices.map((c) => (
            <button
              key={c}
              onClick={() => answerClarify(chatId, turn.id, cl.id, c)}
              className="glass-light rounded-xl px-3.5 py-2 text-[12.5px] text-foreground transition-colors hover:border-mint/40 hover:bg-mint/[0.08]"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ─────────── рассуждения (сворачиваемый блок) ─────────── */

function ThinkingBlock({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const streaming = turn.agentState === "running";
  const notes = Object.values(turn.statusNotes || {});
  const content = [turn.thinkingText || "", ...notes].filter(Boolean).join("\n");
  const hasContent = content.length > 0;
  const thinkingNow = streaming && (turn.thinkingMs === null || turn.thinkingMs === undefined);

  // нет рассуждений и не думаем — старая компактная строка «Думал Xс»
  if (!hasContent && !thinkingNow) {
    if (!streaming && (turn.thinkingMs ?? 0) > 0) {
      return (
        <div className="text-[12px] text-[rgba(220,235,230,0.6)]">
          Думал {(turn.thinkingMs! / 1000).toFixed(1)}с
        </div>
      );
    }
    if (streaming) {
      return (
        <div className="flex items-center gap-2 text-[12px]">
          <Loader2 className="h-3 w-3 animate-spin text-mint" />
          <span className="text-[rgba(220,235,230,0.66)]">Думает…</span>
        </div>
      );
    }
    return null;
  }

  const lastLine = content.split("\n").filter(Boolean).pop() || "";
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        {thinkingNow ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-mint" />
        ) : (
          <Brain className="h-3.5 w-3.5 shrink-0 text-mint/70" />
        )}
        <span className="text-[12px] font-medium text-[rgba(220,235,230,0.75)]">
          {thinkingNow ? "Рассуждает…" : "Рассуждения"}
        </span>
        {!open && (
          <span className="min-w-0 flex-1 truncate text-[11.5px] italic text-[rgba(165,187,179,0.5)]">
            {lastLine}
          </span>
        )}
        {open && <span className="flex-1" />}
        <span className="shrink-0 text-[10.5px] text-[rgba(165,187,179,0.45)]">
          {content.length.toLocaleString("ru-RU")} зн.
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[rgba(220,235,230,0.52)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[rgba(220,235,230,0.52)]" />
        )}
      </button>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="scroll-area max-h-64 overflow-auto border-t border-white/[0.06] px-3.5 py-2.5">
            <p className="whitespace-pre-wrap text-[12px] leading-[1.7] text-[rgba(165,187,179,0.72)]">
              {content}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─────────── компактный статус для обычных пользователей ───────────
   Одна статичная строка вместо простыни шагов: меняется на месте в
   зависимости от текущей фазы («Думает» / «Использует инструмент»),
   без подробностей и без накопления строк. Видна только пока идёт ход. */

function CompactStatus({ turn }: { turn: Turn }) {
  if (turn.agentState !== "running") return null;
  if ((turn.answer || "").length > 0) return null; // ответ пошёл — статус больше не нужен
  const usingTool =
    (turn.tools || []).some((t) => t.status === "running") ||
    Object.keys(turn.statusNotes || {}).length > 0 ||
    (turn.thinkingText || "").length > 0;
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <Loader2 className="h-3 w-3 animate-spin text-mint" />
      <span className="text-[rgba(220,235,230,0.66)]">
        {usingTool ? "Использует инструмент…" : "Думает…"}
      </span>
    </div>
  );
}

/* ─────────── ход агента ─────────── */

export function AgentTurn({ turn, chatId }: { turn: Turn; chatId: string }) {
  const role = useAuthStore((s) => s.user?.role);
  // обычные пользователи видят краткий статус; admin — полные рассуждения и tool-вызовы
  const compact = role !== "admin";
  const streaming = turn.agentState === "running";
  const answerShown =
    streaming && turn.revealed !== undefined
      ? (turn.answer || "").slice(0, turn.revealed)
      : turn.answer || "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group/turn flex flex-col gap-2.5"
    >
      {/* рассуждения и tool-вызовы: admin — подробно, обычный пользователь — одна строка статуса */}
      {compact ? (
        <CompactStatus turn={turn} />
      ) : (
        <>
          <ThinkingBlock turn={turn} />
          {turn.tools && turn.tools.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {turn.tools.map((tc) => (
                <ToolRow key={tc.id} call={tc} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ответ */}
      {answerShown && (
        <div className="relative">
          <MarkdownRenderer text={answerShown} />
          {streaming && turn.revealed !== undefined && turn.revealed < (turn.answer || "").length && (
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-cursor-blink bg-mint align-[-3px] shadow-[0_0_8px_rgba(143,184,174,0.8)]" />
          )}
        </div>
      )}

      {/* approval */}
      {turn.approval && <ApprovalBlock turn={turn} chatId={chatId} />}

      {/* clarify */}
      {turn.clarify && <ClarifyBlock turn={turn} chatId={chatId} />}

      {/* остановлен */}
      {turn.agentState === "cancelled" && (
        <div className="flex items-center gap-2 text-[12px] text-[rgba(220,235,230,0.6)]">
          <Ban className="h-3.5 w-3.5" /> Остановлено
        </div>
      )}

      {/* служебная строка */}
      {turn.agentState === "done" && (
        <div className="group/meta flex items-center gap-2 text-[11px] text-[rgba(220,235,230,0.52)]">
          <span>
            {new Date(turn.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {turn.usage && (
            <>
              <span>·</span>
              <span>↑ {Math.round(turn.usage.inTokens)} ток.</span>
              <span>↓ {Math.round(turn.usage.outTokens)} ток.</span>
              <span>·</span>
              <span>{(turn.usage.durationMs / 1000).toFixed(1)}с</span>
            </>
          )}
          <span
            className={cn(
              "flex gap-1 transition-opacity duration-200",
              "opacity-0 group-hover/meta:opacity-100"
            )}
          >
            <button
              onClick={() => {
                navigator.clipboard.writeText(turn.answer || "");
                toast.success("Ответ скопирован");
              }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/[0.06] hover:text-foreground"
            >
              <Copy className="h-3 w-3" /> Копировать
            </button>
          </span>
        </div>
      )}
    </motion.div>
  );
}
