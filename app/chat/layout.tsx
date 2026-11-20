"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ArtifactsPanel } from "@/components/layout/ArtifactsPanel";

export default function ChatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="relative z-10 flex h-[100dvh] min-h-0 gap-3 p-3 sm:gap-4 sm:p-4 lg:p-5">
      <div className="hidden w-[276px] shrink-0 md:block xl:w-[290px]">
        <Sidebar />
      </div>

      <section className="panel flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </section>

      <div className="hidden w-[276px] shrink-0 xl:block">
        <ArtifactsPanel />
      </div>

      <button
        type="button"
        aria-label="Открыть меню"
        onClick={() => setSidebarOpen(true)}
        className="fixed left-5 top-5 z-40 flex h-10 w-10 items-center justify-center rounded-full glass-medium text-1 shadow-xl md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button aria-label="Закрыть меню" onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <div className="absolute inset-y-3 left-3 w-[min(300px,calc(100vw-24px))]">
            <div className="relative h-full">
              <button type="button" aria-label="Закрыть" onClick={() => setSidebarOpen(false)} className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-2">
                <X className="h-4 w-4" />
              </button>
              <Sidebar />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
