"use client";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { GlassCard } from "@/components/ui/GlassCard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 flex h-[100dvh] min-h-0 gap-3 p-3 sm:gap-4 sm:p-4 lg:p-5">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] glass-strong p-6">
        <div className="flex-1 overflow-y-auto soft-scrollbar">{children}</div>
      </div>
    </div>
  );
}
