"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/stores/authStore";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const sessionChecked = useAuthStore((s) => s.sessionChecked);

  useEffect(() => {
    // Редирект только после сверки с /api/auth/me — иначе гонка с refresh().
    if (hydrated && sessionChecked && !user) router.replace("/");
  }, [hydrated, sessionChecked, user, router]);

  if (!hydrated || !sessionChecked || !user) return null;

  return <AppShell>{children}</AppShell>;
}
