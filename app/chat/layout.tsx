"use client";

import { Sidebar } from "@/components/layout/Sidebar";

export default function ChatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen overflow-hidden bg-midnight">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col p-3 pl-0 sm:p-4 sm:pl-0">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-3xl">
          {children}
        </div>
      </main>
    </div>
  );
}
