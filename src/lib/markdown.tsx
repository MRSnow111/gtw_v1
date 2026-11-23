"use client";

/**
 * Лёгкий безопасный markdown-рендер (фаза 2, фича C).
 * Всё выводится как React-узлы (текст экранируется автоматически) — без
 * dangerouslySetInnerHTML, поэтому агентский markdown не может внедрить скрипт.
 * Поддержка: заголовки, абзацы, **bold**, *italic*, `code`, fenced-блоки,
 * списки (маркированные/нумерованные), цитаты, hr, ссылки [t](https://…).
 */

import { createElement, type ReactNode } from "react";

/** Инлайн-форматирование: текст экранируется React'ом, ссылки только http(s). */
function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[2] !== undefined) {
      nodes.push(<strong key={key} className="font-semibold text-foreground">{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key}>{m[4]}</em>);
    } else if (m[6] !== undefined) {
      nodes.push(
        <code key={key} className="rounded bg-white/[0.07] px-1 py-0.5 font-mono text-[0.9em] text-emerald-300/90">
          {m[6]}
        </code>
      );
    } else if (m[8] !== undefined) {
      const url = m[9];
      if (/^https?:\/\//i.test(url)) {
        nodes.push(
          <a key={key} href={url} target="_blank" rel="noopener noreferrer"
            className="text-mint underline decoration-mint/40 hover:decoration-mint">
            {m[8]}
          </a>
        );
      } else {
        nodes.push(`${m[8]} (${url})`);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING_CLS = [
  "mt-3 mb-1.5 text-lg font-semibold text-foreground",
  "mt-3 mb-1.5 text-base font-semibold text-foreground",
  "mt-2.5 mb-1 text-[15px] font-semibold text-foreground",
  "mt-2 mb-1 text-[13.5px] font-semibold text-foreground",
  "mt-2 mb-1 text-[13px] font-semibold text-foreground",
  "mt-2 mb-1 text-[12.5px] font-semibold text-dim",
];

const LIST_RE = /^\s*([-*+]|\d+\.)\s+/;
const SPECIAL_RE = /^(#{1,6}\s|```|>\s?)/;
const HR_RE = /^\s*([-*_])\s*(\1\s*){2,}$/;

export function Markdown({ source }: { source: string }) {
  const lines = (source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let bk = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push(
        <pre key={bk++} className="scroll-area my-2 overflow-auto rounded-xl border border-white/[0.08] bg-fern-950/70 p-3 font-mono text-[11.5px] leading-relaxed text-[rgba(220,235,230,0.95)]">
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }

    if (/^\s*$/.test(line)) { i++; continue; }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      blocks.push(createElement(`h${level}`, { key: bk++, className: HEADING_CLS[level - 1] }, inline(h[2], `h${bk}`)));
      i++;
      continue;
    }

    // horizontal rule
    if (HR_RE.test(line)) {
      blocks.push(<hr key={bk++} className="my-3 border-white/[0.08]" />);
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      blocks.push(
        <blockquote key={bk++} className="my-2 border-l-2 border-mint/40 pl-3 italic text-dim">
          {buf.map((b, j) => <p key={j} className="my-0.5 text-[13px]">{inline(b, `bq${bk}-${j}`)}</p>)}
        </blockquote>
      );
      continue;
    }

    // list
    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && LIST_RE.test(lines[i])) { items.push(lines[i].replace(LIST_RE, "")); i++; }
      const cls = ordered ? "my-2 list-decimal space-y-1 pl-5" : "my-2 list-disc space-y-1 pl-5";
      blocks.push(
        createElement(ordered ? "ol" : "ul", { key: bk++, className: cls },
          items.map((it, j) => (
            <li key={j} className="text-[13px] leading-relaxed text-[rgba(220,235,230,0.92)]">{inline(it, `li${bk}-${j}`)}</li>
          ))
        )
      );
      continue;
    }

    // paragraph (collect until blank / special)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length && !/^\s*$/.test(lines[i]) &&
      !SPECIAL_RE.test(lines[i]) && !LIST_RE.test(lines[i]) && !HR_RE.test(lines[i])
    ) { buf.push(lines[i]); i++; }
    blocks.push(
      <p key={bk++} className="my-1.5 text-[13px] leading-relaxed text-[rgba(220,235,230,0.92)]">
        {inline(buf.join(" "), `p${bk}`)}
      </p>
    );
  }

  return <div className="scroll-area h-full overflow-auto px-4 py-3">{blocks}</div>;
}