"use client";

// Панель артефактов (docs/design.md §6). Пока пустое состояние из референса.
export function ArtifactsPanel() {
  return (
    <aside className="panel flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold tracking-wide text-1">Артефакты</span>
          <span className="rounded-full border border-white/[.09] bg-white/[.055] px-2 py-0.5 text-[10px] text-[#CFE0D6]">0</span>
        </div>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[.09] bg-white/[.035] text-2 transition-colors hover:border-white/25 hover:text-1"
          title="Открыть отдельно"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M15 3h6v6" />
            <path d="M10 14L21 3" />
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 pb-10 text-center">
        <svg
          viewBox="0 0 24 24"
          className="h-11 w-11 rounded-2xl border border-white/[.08] bg-white/[.035] p-2.5 text-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
        <p className="text-sm leading-relaxed text-3">
          Здесь будут
          <br />
          результаты работы агента
        </p>
      </div>
    </aside>
  );
}
