"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginCard } from "@/components/auth/LoginCard";
import { useAuthStore } from "@/stores/authStore";

export default function LoginPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && user) router.replace("/chat");
  }, [hydrated, user, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <LoginCard />
    </div>
  );
}
