"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";

export function LoginCard() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim() !== "" && password.trim() !== "" && !loading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError("Заполните все поля");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      toast.success("Добро пожаловать в GTW");
      router.push("/chat");
    } catch {
      setError("Сервер недоступен. Попробуйте позже…");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong glass-edge relative w-[420px] max-w-[calc(100vw-32px)] rounded-[30px] p-8"
    >
      {/* шапка */}
      <div className="flex flex-col items-center text-center">
        <span className="glass-light mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(117,214,168,0.9)]" />
          GTW — AI-агент нового поколения
        </span>
        <div className="glass-medium mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] shadow-[0_0_28px_rgba(94,208,174,0.25)]">
          <Sparkles className="h-7 w-7 text-aqua drop-shadow-[0_0_12px_rgba(94,208,174,0.7)]" />
        </div>
        <h1 className="text-3xl font-normal tracking-wide text-mint-soft">GTW</h1>
        <p className="mt-1 text-sm text-[rgba(220,235,230,0.78)]">Войдите в свой аккаунт</p>
      </div>

      {/* форма */}
      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        <div>
          <label htmlFor="login" className="mb-1.5 block text-xs text-[rgba(220,235,230,0.78)]">
            Логин
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(220,235,230,0.6)]" />
            <input
              id="login"
              name="username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass-light w-full rounded-2xl py-2.5 pl-10 pr-3.5 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-[rgba(220,235,230,0.52)] focus:border-mint/50 focus:shadow-[0_0_0_3px_rgba(143,184,174,0.12)]"
              placeholder="Ваш логин"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs text-[rgba(220,235,230,0.78)]">
            Пароль
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(220,235,230,0.6)]" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-light w-full rounded-2xl py-2.5 pl-10 pr-11 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-[rgba(220,235,230,0.52)] focus:border-mint/50 focus:shadow-[0_0_0_3px_rgba(143,184,174,0.12)]"
              placeholder="••••••••"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(220,235,230,0.7)] transition-colors hover:text-foreground"
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-300/90">{error}</p>}
        </div>

        <motion.button
          type="submit"
          disabled={!canSubmit}
          whileHover={canSubmit ? { boxShadow: "0 0 28px rgba(143,184,174,0.35)" } : undefined}
          whileTap={canSubmit ? { scale: 0.98 } : undefined}
          transition={{ duration: 0.2 }}
          className="gradient-primary flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium text-fern-950 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Войти
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </motion.button>
      </form>

      <p className="mt-5 text-center text-[11px] text-[rgba(220,235,230,0.6)]">
        Демо-доступ: подойдёт любой логин и пароль
      </p>
    </motion.div>
  );
}
