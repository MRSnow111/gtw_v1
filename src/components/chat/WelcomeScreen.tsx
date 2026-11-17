"use client";

import { motion } from "framer-motion";
import {
  BarChart3, Code2, FolderSearch, Sparkles, SquareTerminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";

const cards = [
  { icon: Code2, title: "Написать код", desc: "Разработка и отладка", tint: "text-mint" },
  { icon: SquareTerminal, title: "Работа с сервером", desc: "Команды и инструменты", tint: "text-aqua" },
  { icon: BarChart3, title: "Анализ данных", desc: "Визуализация и отчёты", tint: "text-lagoon" },
  { icon: FolderSearch, title: "Работа с файлами", desc: "Обработка и поиск", tint: "text-apricot" },
] as const;

export function WelcomeScreen() {
  const focusComposer = useUiStore((s) => s.focusComposer);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong relative flex h-20 w-20 items-center justify-center rounded-[22px]"
      >
        <Sparkles
          className="h-9 w-9 text-mint"
          style={{ filter: "drop-shadow(0 0 14px rgba(143,184,174,0.55))" }}
        />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 text-[28px] font-normal tracking-wide text-mint-soft"
      >
        Чем займёмся?
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
        className="mt-1.5 text-sm text-[rgba(220,235,230,0.7)]"
      >
        Ваш персональный AI-агент готов к работе
      </motion.p>

      <div className="mt-9 grid w-full max-w-[520px] grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((card, i) => (
          <motion.button
            key={card.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.18 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -3, boxShadow: "0 0 26px rgba(143,184,174,0.18)" }}
            whileTap={{ scale: 0.98 }}
            onClick={focusComposer}
            className="glass-medium group flex items-center gap-3.5 rounded-[20px] p-4 text-left transition-colors duration-200 hover:border-mint/35"
          >
            <div className="glass-light flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] transition-colors group-hover:border-mint/30">
              <card.icon className={cn("h-5 w-5", card.tint)} />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] text-foreground">{card.title}</div>
              <div className="truncate text-[11.5px] text-[rgba(220,235,230,0.62)]">
                {card.desc}
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
