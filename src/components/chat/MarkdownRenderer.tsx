"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/* ─────────── inline-разметка: **bold**, *italic*, `code`, [текст](url) ─────────── */

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) {
      nodes.push(<strong key={key} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded-md border border-white/[0.08] bg-fern-950/60 px-1.5 py-0.5 font-mono text-[0.85em] text-mint">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      nodes.push(
        <a key={key} href={mm[2]} target="_blank" rel="noreferrer" className="text-mint underline decoration-mint/40 underline-offset-2 hover:decoration-mint">
          {mm[1]}
        </a>
      );
    } else {
      nodes.push(<em key={key} className="italic text-dim">{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* ─────────── блок кода ─────────── */

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Код скопирован");
    setTimeout(() => setCopied(false), 1500);
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

/* ─────────── блочный парсер ─────────── */

export function MarkdownRenderer({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // блок кода
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // закрывающая ```
      blocks.push(<CodeBlock key={key++} code={buf.join("\n")} lang={lang} />);
      continue;
    }

    // таблица
    if (line.trim().startsWith("|") && lines[i + 1]?.includes("---")) {
      const header = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2; // шапка + разделитель
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      blocks.push(
        <div key={key++} className="scroll-area my-3 overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                {header.map((h, hi) => (
                  <th key={hi} className="px-3.5 py-2 text-left font-medium text-mint-soft">
                    {renderInline(h, `th${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-white/[0.05] last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3.5 py-2 text-dim">
                      {renderInline(c, `td${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // цитата
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="my-3 rounded-r-lg border-l-2 border-mint/50 bg-mint/[0.06] py-2.5 pl-4 pr-3 text-[13.5px] italic text-dim">
          {renderInline(buf.join(" "), `bq${key}`)}
        </blockquote>
      );
      continue;
    }

    // заголовки
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level <= 2
          ? "mt-4 mb-2 text-[16px] font-medium text-mint-soft"
          : "mt-3.5 mb-1.5 text-[14.5px] font-medium text-foreground";
      blocks.push(<div key={key++} className={cls}>{renderInline(h[2], `h${key}`)}</div>);
      i++;
      continue;
    }

    // hr
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-4 border-white/[0.08]" />);
      i++;
      continue;
    }

    // списки
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d+\./.test(li[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(m[3]);
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag
          key={key++}
          className={`my-2.5 space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-dim ${
            ordered ? "list-decimal" : "list-disc"
          } marker:text-mint/70`}
        >
          {items.map((it, ii) => (
            <li key={ii} className="pl-1">{renderInline(it, `li${ii}`)}</li>
          ))}
        </Tag>
      );
      continue;
    }

    // пустая строка
    if (line.trim() === "") {
      i++;
      continue;
    }

    // абзац
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4}\s|```|\||> |-|\* |\d+\. |---+$)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2 text-[13.5px] leading-[1.7] text-[rgba(220,235,230,0.95)]">
        {renderInline(buf.join(" "), `p${key}`)}
      </p>
    );
  }

  return <div className="min-w-0">{blocks}</div>;
}
