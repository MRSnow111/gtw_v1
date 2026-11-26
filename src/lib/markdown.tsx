"use client";

/**
 * Единый markdown-рендерер проекта (волна 5, K7 + B12).
 *
 * До волны 5 жили два независимых парсера: src/lib/markdown.tsx (артефакты) и
 * src/components/chat/MarkdownRenderer.tsx (чат) — разная типографика, разная
 * поддержка синтаксиса и разное отношение к ссылкам. Теперь движок ОДИН:
 *   • src/components/chat/MarkdownRenderer.tsx — тонкая обёртка (chat-вариант),
 *   • этот файл — движок + doc-вариант для панели артефактов.
 *
 * Безопасность (B12): всё выводится React-узлами (текст экранируется самим
 * React), никакого dangerouslySetInnerHTML; ссылки пропускаются только по
 * allowlist схем http/https/mailto — `javascript:`/`data:`/`vbscript:` и
 * относительные URL рендерятся как текст «текст (url)», а не как ссылка.
 *
 * Производительность: разбор мемоизируется по (variant + text) через LRU-кэш
 * узлов — при стриминге один и тот же текст не парится заново на каждый тик
 * ре-рендера родителя, а закешированные элементы имеют ту же идентичность,
 * поэтому React пропускает перерисовку поддерева (в т.ч. CodeBlock).
 *
 * Поддержка: заголовки h1–h6, абзацы, жирный/курсив/inline-код, fenced-блоки
 * с кнопкой копирования и меткой языка, таблицы (GFM-подобные), списки
 * (маркированные дефисом, звёздочкой, плюсом и нумерованные), цитаты, hr,
 * ссылки [t](url).
 */

import { createElement, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export type MarkdownVariant = "chat" | "doc";

/* ─────────── санитизация ссылок (B12) ─────────── */

const ALLOWED_SCHEMES = ["http:", "https:", "mailto:"];

/**
 * Возвращает безопасный href либо null. Управляющие символы/пробелы внутри
 * схемы вырезаются, иначе «java\tscript:alert(1)» или «JaVaScRiPt:» обходят
 * наивную проверку префиксом.
 */
export function safeHref(raw: string): string | null {
  if (!raw) return null;
  const url = raw.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // относительный / фрагмент / мусор — не ссылка
  }
  return ALLOWED_SCHEMES.includes(parsed.protocol.toLowerCase()) ? url : null;
}

/* ─────────── инлайн-разметка ─────────── */

const INLINE_RE =
  /(\*\*([^*]+)\*\*)|(\*([^*\n]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;

function inline(text: string, keyBase: string, st: Styles): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(INLINE_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[2] !== undefined) {
      nodes.push(<strong key={key} className="font-semibold text-foreground">{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key} className={st.emphasis}>{m[4]}</em>);
    } else if (m[6] !== undefined) {
      nodes.push(
        <code key={key} className={st.inlineCode}>
          {m[6]}
        </code>
      );
    } else if (m[8] !== undefined) {
      const href = safeHref(m[9]);
      if (href) {
        nodes.push(
          <a
            key={key}
            href={href}
            target={href.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className={st.link}
          >
            {m[8]}
          </a>
        );
      } else {
        // опасная/относительная схема: показываем текст, ссылку не создаём
        nodes.push(`${m[8]} (${m[9]})`);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* ─────────── блок кода с копированием ─────────── */

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // таймер «Скопировано» снимается на unmount (B-мелочь из аудита UI)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      toast.error("Не удалось скопировать");
      return;
    }
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/[0.08] bg-fern-950/70">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-[rgba(220,235,230,0.58)]">
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[rgba(220,235,230,0.7)] transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <pre className="scroll-area overflow-x-auto p-3.5 font-mono text-[12.5px] leading-[1.65] text-[rgba(220,235,230,0.95)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ─────────── токеномика блоков по вариантам ─────────── */

interface Styles {
  emphasis: string;
  inlineCode: string;
  link: string;
  headings: string[];
  paragraph: string;
  listItem: string;
  list: string;
  quote: string;
  quoteBody: string;
  hr: string;
  th: string;
  td: string;
}

const CHAT_STYLES: Styles = {
  emphasis: "italic text-dim",
  inlineCode:
    "rounded-md border border-white/[0.08] bg-fern-950/60 px-1.5 py-0.5 font-mono text-[0.85em] text-mint",
  link: "text-mint underline decoration-mint/40 underline-offset-2 hover:decoration-mint",
  headings: [
    "mt-4 mb-2 text-[16.5px] font-medium text-mint-soft",
    "mt-4 mb-2 text-[15.5px] font-medium text-mint-soft",
    "mt-3.5 mb-1.5 text-[14.5px] font-medium text-foreground",
    "mt-3.5 mb-1.5 text-[14px] font-medium text-foreground",
    "mt-3 mb-1 text-[13.5px] font-medium text-foreground",
    "mt-3 mb-1 text-[13px] font-medium text-dim",
  ],
  paragraph: "my-2 text-[13.5px] leading-[1.7] text-[rgba(220,235,230,0.95)]",
  listItem: "pl-1",
  list: "my-2.5 space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-dim marker:text-mint/70",
  quote:
    "my-3 rounded-r-lg border-l-2 border-mint/50 bg-mint/[0.06] py-2.5 pl-4 pr-3 text-[13.5px] italic text-dim",
  quoteBody: "",
  hr: "my-4 border-white/[0.08]",
  th: "px-3.5 py-2 text-left font-medium text-mint-soft",
  td: "px-3.5 py-2 text-dim",
};

const DOC_STYLES: Styles = {
  emphasis: "italic text-dim",
  inlineCode:
    "rounded bg-white/[0.07] px-1 py-0.5 font-mono text-[0.9em] text-emerald-300/90",
  link: "text-mint underline decoration-mint/40 hover:decoration-mint",
  headings: [
    "mt-3 mb-1.5 text-lg font-semibold text-foreground",
    "mt-3 mb-1.5 text-base font-semibold text-foreground",
    "mt-2.5 mb-1 text-[15px] font-semibold text-foreground",
    "mt-2 mb-1 text-[13.5px] font-semibold text-foreground",
    "mt-2 mb-1 text-[13px] font-semibold text-foreground",
    "mt-2 mb-1 text-[12.5px] font-semibold text-dim",
  ],
  paragraph: "my-1.5 text-[13px] leading-relaxed text-[rgba(220,235,230,0.92)]",
  listItem: "text-[13px] leading-relaxed text-[rgba(220,235,230,0.92)]",
  list: "my-2 space-y-1 pl-5",
  quote: "my-2 border-l-2 border-mint/40 pl-3 italic text-dim",
  quoteBody: "my-0.5 text-[13px]",
  hr: "my-3 border-white/[0.08]",
  th: "px-3 py-1.5 text-left font-semibold text-mint-soft",
  td: "px-3 py-1.5 text-[rgba(220,235,230,0.9)]",
};

const STYLES: Record<MarkdownVariant, Styles> = { chat: CHAT_STYLES, doc: DOC_STYLES };

/* ─────────── блочный парсер ─────────── */

const LIST_RE = /^\s*([-*+]|\d+\.)\s+/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^\s*([-*_])\s*(?:\1\s*){2,}$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})\s*([\w.+-]*)/;
const QUOTE_RE = /^\s*>\s?/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const SPECIAL_RE = /^(#{1,6}\s|```|~~~|>\s?|\|)/;

/** Строка-разделитель GFM-таблицы: каждая ячейка — `---`, `:---`, `---:` или `:---:`. */
function isTableSep(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = line.split("|").map((c) => c.trim()).filter((c) => c !== "");
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function parseBlocks(source: string, variant: MarkdownVariant): ReactNode[] {
  const st = STYLES[variant] ?? CHAT_STYLES;
  const lines = (source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let bk = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const mark = fence[1][0] === "`" ? "`" : "~";
      const lang = fence[2] || "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !new RegExp("^\\s*" + mark + "{3,}\\s*$").test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // закрывающая линия
      blocks.push(<CodeBlock key={bk++} code={buf.join("\n")} lang={lang} />);
      continue;
    }

    if (/^\s*$/.test(line)) { i++; continue; }

    // таблица: строка | … | + разделитель из тире
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      blocks.push(
        <div key={bk++} className="scroll-area my-3 overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                {header.map((h, hi) => (
                  <th key={hi} className={st.th}>{inline(h, `th${bk}-${hi}`, st)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-white/[0.05] last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className={st.td}>{inline(c, `td${bk}-${ri}-${ci}`, st)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // заголовок
    const h = HEADING_RE.exec(line);
    if (h) {
      const level = h[1].length;
      blocks.push(
        createElement(`h${level}`, { key: bk++, className: st.headings[level - 1] },
          inline(h[2], `h${bk}`, st))
      );
      i++;
      continue;
    }

    // горизонтальная линия
    if (HR_RE.test(line)) {
      blocks.push(<hr key={bk++} className={st.hr} />);
      i++;
      continue;
    }

    // цитата
    if (QUOTE_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) { buf.push(lines[i].replace(QUOTE_RE, "")); i++; }
      blocks.push(
        <blockquote key={bk++} className={st.quote}>
          {st.quoteBody
            ? buf.map((b, j) => <p key={j} className={st.quoteBody}>{inline(b, `bq${bk}-${j}`, st)}</p>)
            : inline(buf.join(" "), `bq${bk}`, st)}
        </blockquote>
      );
      continue;
    }

    // список
    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && LIST_RE.test(lines[i])) { items.push(lines[i].replace(LIST_RE, "")); i++; }
      blocks.push(
        createElement(ordered ? "ol" : "ul",
          { key: bk++, className: `${st.list} ${ordered ? "list-decimal" : "list-disc"}` },
          items.map((it, j) => <li key={j} className={st.listItem}>{inline(it, `li${bk}-${j}`, st)}</li>)
        )
      );
      continue;
    }

    // абзац: до пустой строки / начала спец-блока
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length && !/^\s*$/.test(lines[i]) &&
      !SPECIAL_RE.test(lines[i]) && !LIST_RE.test(lines[i]) && !HR_RE.test(lines[i])
    ) { buf.push(lines[i]); i++; }
    blocks.push(<p key={bk++} className={st.paragraph}>{inline(buf.join(" "), `p${bk}`, st)}</p>);
  }

  return blocks;
}

/* ─────────── мемоизация разбора (LRU по text+variant) ─────────── */

const CACHE_LIMIT = 64;
const blockCache = new Map<string, ReactNode[]>();

/** Чистый разбор с кэшем: один и тот же (variant, text) парится один раз. */
export function renderMarkdown(source: string, variant: MarkdownVariant = "doc"): ReactNode[] {
  const key = variant + "\u0000" + source;
  const hit = blockCache.get(key);
  if (hit) {
    blockCache.delete(key);      // LRU: перекидываем в конец
    blockCache.set(key, hit);
    return hit;
  }
  const out = parseBlocks(source, variant);
  blockCache.set(key, out);
  if (blockCache.size > CACHE_LIMIT) {
    const oldest = blockCache.keys().next().value;
    if (oldest !== undefined) blockCache.delete(oldest);
  }
  return out;
}

/* ─────────── публичные компоненты ─────────── */

/** Листающий контейнер для панели артефактов (исторический API: prop `source`). */
export const Markdown = memo(function Markdown({
  source,
  variant = "doc",
}: {
  source: string;
  variant?: MarkdownVariant;
}) {
  const blocks = useMemo(() => renderMarkdown(source, variant), [source, variant]);
  return (
    <div className="scroll-area h-full overflow-auto px-4 py-3">
      <div className="mx-auto max-w-3xl">{blocks}</div>
    </div>
  );
});
