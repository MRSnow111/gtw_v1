"use client";

/**
 * Inline-просмотр офисных файлов БЕЗ конвертации в PDF:
 *  - .docx → docx-preview (рендер в DOM-контейнер, не React dangerouslySetInnerHTML);
 *  - .xlsx/.xls → SheetJS → таблица React-узлами;
 *  - остальные (pptx/doc/ppt/odt/…) → карточка «Скачать» + «Открыть как PDF».
 * Библиотеки грузятся динамически (import()) только в браузере.
 */

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Presentation, TriangleAlert } from "lucide-react";
import type { Artifact } from "@/lib/demoData";
import { extOf } from "@/lib/fileKind";

const dlUrl = (a: Artifact) =>
  a.url ? `${a.url}${a.url.includes("?") ? "&" : "?"}download=1` : undefined;

type LoadState = "loading" | "ok" | "error";

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-light flex flex-1 flex-col items-center justify-center gap-3 rounded-xl p-6 text-center text-xs text-dim">
      {children}
    </div>
  );
}

function Loading() {
  return (
    <Center>
      <Loader2 className="h-5 w-5 animate-spin text-mint" />
      <p>Загрузка документа…</p>
    </Center>
  );
}

function ErrorBox({ a }: { a: Artifact }) {
  return (
    <Center>
      <TriangleAlert className="h-6 w-6 text-amber-300" />
      <p>Не удалось открыть документ</p>
      {dlUrl(a) && (
        <a
          href={dlUrl(a)}
          download={a.name}
          className="glass-medium flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs text-foreground transition-colors hover:border-mint/40"
        >
          <Download className="h-3.5 w-3.5" /> Скачать
        </a>
      )}
    </Center>
  );
}

/* ─────────── Word (.docx) ─────────── */

function DocxView({ a }: { a: Artifact }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    const el = ref.current;
    if (!a.url || !el) return;
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const res = await fetch(a.url!, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const mod = await import("docx-preview");
        if (!alive || !ref.current) return;
        ref.current.replaceChildren();
        await mod.renderAsync(blob, ref.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          experimental: true,
        });
        if (alive) setState("ok");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [a.url]);

  if (state === "error") return <ErrorBox a={a} />;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {state === "loading" && (
        <div className="absolute inset-0 z-10">
          <Loading />
        </div>
      )}
      {/* docx-preview рендерит сюда DOM-узлы со своими стилями (белые «страницы») */}
      <div
        ref={ref}
        className="docx-host scroll-area min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.08] bg-[#525659]"
      />
    </div>
  );
}

/* ─────────── Excel (.xlsx/.xls) ─────────── */

type Sheet = { name: string; rows: string[][] };
const MAX_ROWS = 400;
const MAX_COLS = 40;

function XlsxView({ a }: { a: Artifact }) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<LoadState>("loading");
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!a.url) return;
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const res = await fetch(a.url!, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        const XLSX = await import("xlsx");
        if (!alive) return;
        const wb = XLSX.read(buf, { type: "array" });
        const parsed: Sheet[] = wb.SheetNames.map((nm) => {
          const ws = wb.Sheets[nm];
          const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
            header: 1,
            defval: "",
            raw: false,
          });
          return { name: nm, rows: rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS)) };
        });
        if (!alive) return;
        setTruncated(
          wb.SheetNames.some((nm) => {
            const ws = wb.Sheets[nm];
            const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
            return rows.length > MAX_ROWS || rows.some((r) => r.length > MAX_COLS);
          })
        );
        setSheets(parsed);
        setActive(0);
        setState("ok");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [a.url]);

  if (state === "loading") return <Loading />;
  if (state === "error") return <ErrorBox a={a} />;
  const sheet = sheets[active];
  if (!sheet || !sheet.rows.length) {
    return (
      <Center>
        <FileText className="h-6 w-6 text-mint" />
        <p>Лист пуст</p>
      </Center>
    );
  }
  const [head, ...body] = sheet.rows;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {sheets.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-1">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActive(i)}
              className={
                "rounded-full px-3 py-1 text-[11px] transition-colors " +
                (i === active ? "bg-mint/18 text-foreground" : "text-dim hover:text-foreground")
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="scroll-area min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.08] bg-fern-950/40">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {head.map((c, i) => (
                <th
                  key={i}
                  className="border-b border-r border-white/[0.08] bg-fern-900/95 px-2.5 py-1.5 text-left font-medium text-mint-soft last:border-r-0"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri} className="odd:bg-white/[0.02]">
                {head.map((_, ci) => (
                  <td
                    key={ci}
                    className="border-b border-r border-white/[0.05] px-2.5 py-1.5 text-dim last:border-r-0"
                  >
                    {r[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="shrink-0 text-[10.5px] text-[rgba(220,235,230,0.5)]">
          Показаны первые {MAX_ROWS} строк — скачайте файл, чтобы увидеть всё.
        </p>
      )}
    </div>
  );
}

/* ─────────── прочие офисные (pptx/doc/ppt/odt/…) ─────────── */

function OfficeFallback({ a, onConvert }: { a: Artifact; onConvert: (a: Artifact) => void }) {
  return (
    <div className="glass-light flex flex-1 flex-col items-center justify-center gap-3 rounded-xl p-6 text-center">
      <div className="glass-medium flex h-14 w-14 items-center justify-center rounded-2xl">
        <Presentation className="h-6 w-6 text-mint" />
      </div>
      <div className="text-[13px] text-foreground">{a.name}</div>
      <div className="text-[11px] text-[rgba(220,235,230,0.6)]">
        Офисный документ{a.size ? ` · ${a.size}` : ""}
      </div>
      {dlUrl(a) && (
        <a
          href={dlUrl(a)}
          download={a.name}
          className="glass-medium mt-1 flex items-center gap-2 rounded-xl px-4 py-2 text-xs text-foreground transition-colors hover:border-mint/40"
        >
          <Download className="h-3.5 w-3.5" /> Скачать
        </a>
      )}
      <button
        onClick={() => onConvert(a)}
        className="flex items-center gap-1.5 text-[11px] text-dim transition-colors hover:text-foreground"
      >
        <FileText className="h-3 w-3" /> Открыть как PDF
      </button>
      <p className="max-w-[260px] text-[10.5px] leading-relaxed text-[rgba(220,235,230,0.5)]">
        Этот формат нельзя показать прямо в браузере — агент сконвертирует его в PDF и пришлёт в чат.
      </p>
    </div>
  );
}

/* ─────────── роутер по расширению ─────────── */

export function OfficeViewer({ a, onConvert }: { a: Artifact; onConvert: (a: Artifact) => void }) {
  const ext = extOf(a.name);
  if (ext === "docx") return <DocxView a={a} />;
  if (ext === "xlsx" || ext === "xls") return <XlsxView a={a} />;
  return <OfficeFallback a={a} onConvert={onConvert} />;
}