"use client";

import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { Code2, Terminal, BarChart3, FileText, Leaf, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  { icon: Code2, title: "Написать код", caption: "Разработка и отладка", prompt: "Помоги написать и отладить код" },
  { icon: Terminal, title: "Работа с сервером", caption: "Команды и инструменты", prompt: "Помоги разобраться с сервером" },
  { icon: BarChart3, title: "Анализ данных", caption: "Визуализация и отчёты", prompt: "Проанализируй мои данные" },
  { icon: FileText, title: "Работа с файлами", caption: "Обработка и поиск", prompt: "Помоги изучить файл" },
];

export default function ChatWelcomePage() {
  return (
    <>
      <ChatHeader chatId="new" />
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 pb-5 pt-4 sm:px-8">
        <div className="pointer-events-none absolute left-1/2 top-[18%] h-64 w-64 -translate-x-1/2 rounded-full bg-[rgba(115,174,151,.08)] blur-[90px]" />
        <div className="relative flex w-full max-w-[620px] flex-col items-center text-center">
          <div className="relative mb-6 flex h-[76px] w-[76px] items-center justify-center rounded-[25px] border border-[rgba(190,225,211,.20)] bg-[linear-gradient(145deg,rgba(180,220,203,.17),rgba(35,76,64,.14))] shadow-[0_18px_48px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.18),0_0_42px_rgba(109,166,144,.10)] backdrop-blur-2xl">
            <Leaf className="h-8 w-8 text-[#B3D5C7]" strokeWidth={1.45} />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(143,184,174,.24)] bg-[#17352D] text-[#B6D9CA]"><Sparkles className="h-3 w-3" /></span>
          </div>
          <div className="mb-2 flex items-center gap-2 rounded-full border border-white/[.09] bg-white/[.035] px-3 py-1.5 text-[10px] font-medium tracking-[.12em] text-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8FB8AE] shadow-[0_0_9px_rgba(143,184,174,.8)]" />PERSONAL AI WORKSPACE
          </div>
          <h1 className="text-[30px] font-medium tracking-[-.045em] text-1 sm:text-[36px]">Чем займёмся?</h1>
          <p className="mt-2 max-w-md text-[13px] leading-6 text-2 sm:text-[14px]">Ваш персональный AI-агент готов к работе. Опишите задачу — и начнём.</p>

          <div className="mt-9 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {SUGGESTIONS.map(({ icon: Icon, title, caption }) => (
              <button key={title} type="button" onClick={() => window.dispatchEvent(new CustomEvent("gtw:composer-prompt", { detail: title }))} className="group flex min-h-[82px] items-center gap-3.5 rounded-[19px] border border-white/[.09] bg-[linear-gradient(145deg,rgba(220,235,230,.065),rgba(17,43,35,.28))] px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_12px_30px_rgba(0,0,0,.10)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(143,184,174,.27)] hover:bg-[rgba(143,184,174,.10)] hover:shadow-[0_16px_36px_rgba(0,0,0,.18),0_0_28px_rgba(109,166,144,.07)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[rgba(143,184,174,.14)] bg-[rgba(143,184,174,.09)] text-[#A9CDBE] transition-colors group-hover:bg-[rgba(143,184,174,.16)]"><Icon className="h-[18px] w-[18px]" strokeWidth={1.7} /></span>
                <span className="min-w-0"><span className="block text-[13px] font-medium text-1">{title}</span><span className="mt-1 block text-[11px] text-3">{caption}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <Composer chatId="new" />
    </>
  );
}
