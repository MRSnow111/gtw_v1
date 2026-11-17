"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { Badge } from "@/components/ui/Badge";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

const STAGGER_CHILD = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as const },
};

const CARD_ANIM = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] as const },
};

export function LoginScreen() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) {
      setError("Заполните все поля");
      return;
    }
    setLoading(true);
    setError("");
    // TODO: real auth — бэкенд пока отсутствует
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
      {/* Glow behind card */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <div className="h-[400px] w-[400px] rounded-full bg-[rgba(143,184,174,0.06)] blur-[100px] animate-glow-pulse" />
      </div>

      <motion.div
        {...CARD_ANIM}
        className="relative w-full max-w-[420px]"
      >
        {/* Badge */}
        <motion.div
          variants={STAGGER_CHILD}
          initial="initial"
          animate="animate"
          className="flex justify-center mb-8"
        >
          <Badge dot="green" className="glass-light rounded-full">
            ● GTW — AI-агент нового поколения
          </Badge>
        </motion.div>

        {/* Auth card */}
        <GlassCard variant="strong" glow className="glass-hover">
          <motion.div
            variants={STAGGER_CHILD}
            initial="initial"
            animate="animate"
            className="text-center mb-8"
          >
            {/* Logo */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl glass-light mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                className="text-[rgba(143,184,174,0.8)]"
              >
                {/* Leaf icon */}
                <path
                  d="M16 4C16 4 8 8 8 18C8 24 12 28 16 28C20 28 24 24 24 18C24 8 16 4 16 4Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 12V24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M12 16C14 14 16 14 16 14"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <path
                  d="M20 18C18 16 16 16 16 16"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-[rgba(220,235,230,0.85)] tracking-tight mb-1">
              GTW
            </h1>
            <p className="text-sm text-[rgba(220,235,230,0.42)]">
              Войдите в свой аккаунт
            </p>
          </motion.div>

          {/* Form */}
          <motion.form
            variants={STAGGER_CHILD}
            initial="initial"
            animate="animate"
            onSubmit={handleSubmit}
            className="space-y-5"
            noValidate
          >
            <GlassInput
              label="Логин"
              type="text"
              placeholder="Введите логин"
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                if (error) setError("");
              }}
              autoComplete="username"
              autoFocus
            />

            <GlassInput
              label="Пароль"
              type={showPassword ? "text" : "password"}
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              autoComplete="current-password"
              error={error}
            />

            {/* Toggle password visibility */}
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs text-[rgba(220,235,230,0.4)] hover:text-[rgba(220,235,230,0.7)] transition-colors"
              >
                {showPassword ? "Скрыть" : "Показать"}
              </button>
            </div>

            {/* Submit */}
            <GlassButton
              variant="primary"
              size="lg"
              className="w-full mt-2"
              loading={loading}
              type="submit"
              icon={!loading ? <ArrowRight className="w-4 h-4" /> : undefined}
            >
              Войти
            </GlassButton>
          </motion.form>

          {/* Footer hint */}
          <motion.p
            variants={STAGGER_CHILD}
            initial="initial"
            animate="animate"
            className="text-center text-xs text-[rgba(220,235,230,0.25)] mt-6"
          >
            Свяжитесь с администратором для получения учётных данных
          </motion.p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
