"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { ArtifactsPanel } from "@/components/layout/ArtifactsPanel";

// Плавающий дашборд из трёх стеклянных панелей над «лесом» (референс-дизайн).
export default function ChatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen gap-6 p-6 sm:p-8">
      <div className="hidden w-[290px] shrink-0 md:block">
        <Sidebar />
      </div>
      <section className="panel flex min-w-0 flex-1 flex-col">
        {children}
      </section>
      <div className="hidden w-[276px] shrink-0 xl:block">
        <ArtifactsPanel />
      </div>
    </div>
  );
}
