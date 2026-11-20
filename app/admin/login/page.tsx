"use client";

import { useRouter } from "next/navigation";
import { GlassButton } from "@/components/ui/GlassButton";
import { AdminCard } from "@/components/admin/AdminCard";
import { LogIn, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  const checkAuth = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/admin/health");
      if (res.ok) {
        router.push("/admin");
      } else {
        // Нет куки — перенаправляем на вход в чат
        router.push("/chat");
      }
    } catch {
      router.push("/chat");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex h-[100dvh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-[#8FB8AE] to-[#4D7B73] flex items-center justify-center">
            <span className="text-lg font-bold text-[#0A1412]">GTW</span>
          </div>
          <h1 className="text-2xl font-bold text-[rgba(220,235,230,0.95)]">
            Админ-панель
          </h1>
          <p className="text-sm text-[rgba(165,187,179,0.6)]">
            Управление gateway
          </p>
        </div>

        <AdminCard variant="medium" className="text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-[rgba(143,184,174,0.1)] flex items-center justify-center">
            <LogIn className="h-6 w-6 text-[rgba(143,184,174,0.6)]" />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-[rgba(220,235,230,0.7)]">
              Для входа в админ-панель необходимо быть авторизованным
            </p>
            <p className="text-xs text-[rgba(165,187,179,0.5)]">
              Если вы уже вошли в чат — нажмите «Войти» ниже
            </p>
          </div>

          <GlassButton
            size="lg"
            icon={<ArrowRight className="h-5 w-5" />}
            onClick={checkAuth}
            disabled={checking}
          >
            {checking ? "Проверка..." : "Войти"}
          </GlassButton>
        </AdminCard>

        <p className="text-center text-xs text-[rgba(165,187,179,0.35)]">
          Демо: demo / demo
        </p>
      </div>
    </div>
  );
}
