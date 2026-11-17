"use client";

import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { Code2, Terminal, BarChart3, FileText, Leaf } from "lucide-react";
import { useRouter } from "next/navigation";

const SUGGESTIONS = [
  { icon: Code2, title: "Написать код", caption: "Разработка и отладка" },
  { icon: Terminal, title: "Работа с сервером", caption: "Команды и инструменты" },
  { icon: BarChart3, title: "Анализ данных", caption: "Визуализация и отчёты" },
  { icon: FileText, title: "Работа с файлами", caption: "Обработка и поиск" },
];

// Пустое состояние центра по референсу: «Чем займёмся?» + сетка 2×2 + композер.
export default function ChatWelcomePage() {
  const router = useRouter();

  return (
    <>
      <ChatHeader chatId="new" />

      <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-4">
        <div className="flex w-full max-w-2xl flex-col items-center text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[22px] border border-white/12 bg-white/[0.06] shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <Leaf className="h-9 w-9 accent" strokeWidth={1.6} />
          </div>
          <h1 className="mb-2 text-[30px] font-medium text-1">Чем займёмся?</h1>
          <p className="mb-8 text-[15px] text-2">
            Ваш персональный AI-агент готов к работе
          </p>

          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            {SUGGESTIONS.map(({ icon: Icon, title, caption }) => (
              <button
                key={title}
                onClick={() => router.push("/chat")}
                className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.05] p-4 text-left transition-colors hover:border-[rgba(110,231,168,0.30)] hover:bg-white/[0.08]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(110,231,168,0.14)]">
                  <Icon className="h-5 w-5 text-[#A7E8C3]" strokeWidth={1.8} />
                </span>
                <span>
                  <span className="block text-[15px] font-medium text-1">{title}</span>
                  <span className="block text-[13px] text-2">{caption}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Composer chatId="new" />
    </>
  );
}
