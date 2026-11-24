"use client";

import { useEffect } from "react";
import { Globe, Loader2, Play, Square, TriangleAlert } from "lucide-react";
import { useBrowserLiveStore } from "@/stores/browserLiveStore";
import { cn } from "@/lib/utils";

/**
 * Live-просмотр браузера агента: auto-refresh JPEG-кадры из CDP screencast.
 * Картинка обновляется на каждый кадр "browser_frame" (без перезагрузки страницы).
 */
export function LiveBrowser({ chatId }: { chatId: string | null }) {
  const active = useBrowserLiveStore((s) => s.active);
  const dataUrl = useBrowserLiveStore((s) => s.dataUrl);
  const url = useBrowserLiveStore((s) => s.url);
  const fps = useBrowserLiveStore((s) => s.fps);
  const error = useBrowserLiveStore((s) => s.error);
  const start = useBrowserLiveStore((s) => s.start);
  const stop = useBrowserLiveStore((s) => s.stop);

  // закрыли режим/панель — гасим поток, чтобы не держать CDP-продюсер без зрителей
  useEffect(() => {
    return () => {
      if (useBrowserLiveStore.getState().active) stop(chatId || "main");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = active && !!dataUrl;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      {/* шапка live */}
      <div className="mb-2 flex items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-mint" />
        <span className="text-[12px] text-dim">Браузер агента</span>
        {live && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            LIVE
          </span>
        )}
        {live && fps > 0 && (
          <span className="tabular-nums text-[10px] text-[rgba(220,235,230,0.5)]">{fps} к/с</span>
        )}
        <div className="flex-1" />
        {active ? (
          <button
            onClick={() => stop(chatId || "main")}
            className="glass-light flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-dim transition-colors hover:text-red-300"
          >
            <Square className="h-3 w-3" /> Стоп
          </button>
        ) : (
          <button
            onClick={() => start(chatId || "main")}
            className="glass-light flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-mint transition-colors hover:text-foreground"
          >
            <Play className="h-3 w-3" /> Смотреть
          </button>
        )}
      </div>

      {/* адресная строка */}
      {url && (
        <div className="mb-2 truncate rounded-lg border border-white/[0.06] bg-fern-950/50 px-2.5 py-1.5 font-mono text-[11px] text-[rgba(220,235,230,0.7)]">
          {url}
        </div>
      )}

      {/* тело */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-fern-950/60">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <TriangleAlert className="h-6 w-6 text-amber-300" />
            <p className="text-xs leading-relaxed text-[rgba(220,235,230,0.7)]">
              {error === "no_cdp"
                ? "Браузер агента сейчас не запущен или недоступен для просмотра."
                : "Соединение с браузером прервано."}
            </p>
            <button
              onClick={() => start(chatId || "main")}
              className="glass-light flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] text-mint hover:text-foreground"
            >
              <Play className="h-3 w-3" /> Повторить
            </button>
          </div>
        ) : live ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="Браузер агента (live)"
            className="h-full w-full object-contain object-top"
          />
        ) : active ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-mint" />
            <p className="text-xs text-[rgba(220,235,230,0.6)]">Подключение к браузеру…</p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Globe className="h-7 w-7 text-[rgba(220,235,230,0.5)]" />
            <p className="text-xs leading-relaxed text-[rgba(220,235,230,0.6)]">
              Нажмите «Смотреть», чтобы видеть браузер агента в реальном времени, пока он работает.
            </p>
            <button
              onClick={() => start(chatId || "main")}
              className={cn(
                "glass-light flex h-9 items-center gap-2 rounded-xl px-4 text-[12px] text-mint",
                "transition-colors hover:text-foreground"
              )}
            >
              <Play className="h-3.5 w-3.5" /> Смотреть браузер
            </button>
          </div>
        )}
      </div>
    </div>
  );
}