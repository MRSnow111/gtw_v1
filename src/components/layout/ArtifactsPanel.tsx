"use client";

import { useEffect } from "react";
import { Inbox, PanelRightClose, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";

/**
 * Панель артефактов (docs/design.md §6). Пока — каркас и пустое состояние;
 * список/просмотрщик подключатся к `file.ready` и tool-выводам.
 */
export function ArtifactsPanel() {
  const { artifactsOpen, setArtifactsOpen } = useUiStore();
  const artifacts: unknown[] = [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setArtifactsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setArtifactsOpen]);

  return (
    <>
      <div
        onClick={() => setArtifactsOpen(false)}
        className={cn(
          "fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden",
          artifactsOpen === true ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        aria-label="Артефакты"
        className={cn(
          "glass z-40 flex flex-col overflow-hidden rounded-[1.75rem] transition-all duration-300",
          // <1024px — overlay поверх ленты; lg+ — третья колонка
          "fixed inset-y-3 right-3 w-[min(24rem,calc(100vw-1.5rem))] lg:static lg:inset-auto lg:h-full lg:w-80 lg:shrink-0 lg:translate-x-0 xl:w-96",
          artifactsOpen === true ? "translate-x-0" : "translate-x-[120%]",
          artifactsOpen === false && "lg:hidden"
        )}
      >
        <header className="flex h-16 shrink-0 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <h2 className="font-semibold">Артефакты</h2>
            <span className="glass-inner rounded-full px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {artifacts.length}
            </span>
          </div>
          <button
            type="button"
            aria-label="Закрыть панель"
            onClick={() => setArtifactsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
          >
            <PanelRightClose className="hidden h-[18px] w-[18px] lg:block" />
            <X className="h-[18px] w-[18px] lg:hidden" />
          </button>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-16 text-center">
          <div className="glass-inner flex h-16 w-16 items-center justify-center rounded-2xl text-muted-foreground">
            <Inbox className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Здесь будут результаты
            <br />
            работы агента
          </p>
        </div>
      </aside>
    </>
  );
}
