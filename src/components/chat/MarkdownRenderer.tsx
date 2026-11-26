"use client";

/**
 * Тонкая обёртка над единым markdown-движком (волна 5, K7).
 * Реальный парсер живёт в `@/lib/markdown` — здесь только чат-вариант
 * типографики и мемоизация по тексту, чтобы при стриминге не перепарсивать
 * блок на каждый тик `revealed` без изменения самого текста.
 */

import { memo, useMemo } from "react";
import { renderMarkdown, safeHref, type MarkdownVariant } from "@/lib/markdown";

export { safeHref };
export type { MarkdownVariant };

export const MarkdownRenderer = memo(function MarkdownRenderer({ text }: { text: string }) {
  const blocks = useMemo(() => renderMarkdown(text || "", "chat"), [text]);
  return <div className="min-w-0">{blocks}</div>;
});

export default MarkdownRenderer;
