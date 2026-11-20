"use client";

import { motion } from "framer-motion";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

/**
 * Каркас /admin*: те же плавающие стеклянные панели над общим фоном,
 * что и в /chat (AppShell). На мобильных навигация — чипы сверху.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col gap-3 p-3 md:flex-row">
      <AdminSidebar />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        className="glass-strong glass-edge relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px]"
      >
        <div className="flex-1 overflow-y-auto scroll-area p-5 sm:p-6">{children}</div>
      </motion.main>
    </div>
  );
}
