"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useDemoStore } from "@/stores/demoStore";
import { AgentTurn, UserTurn } from "@/components/chat/TurnComponents";
import { WelcomeScreen } from "@/components/chat/WelcomeScreen";

function Skeletons() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="w-full max-w-3xl space-y-2">
          <div
            className={`skeleton h-4 ${i % 2 ? "ml-auto w-1/3" : "w-2/3"}`}
            style={{ animationDelay: `${i * 0.12}s` }}
          />
          <div
            className={`skeleton h-3 ${i % 2 ? "ml-auto w-2/5" : "w-1/2"}`}
            style={{ animationDelay: `${i * 0.12 + 0.06}s` }}
          />
        </div>
      ))}
    </div>
  );
}

interface MessageListProps {
  chatId: string | null;
}

export function MessageList({ chatId }: MessageListProps) {
  const { turnsByChat, loadingChats, chats, loadTurns } = useDemoStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  const turns = chatId ? turnsByChat[chatId] : undefined;
  const loading = chatId ? !!loadingChats[chatId] : false;
  const chatExists = useMemo(
    () => !chatId || chats.some((c) => c.id === chatId),
    [chats, chatId]
  );

  useEffect(() => {
    if (chatId && !turns && !loadingChats[chatId]) loadTurns(chatId);
  }, [chatId, turns, loadingChats, loadTurns]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns?.length, turns?.[turns.length - 1]?.revealed]);

  /* несуществующий чат */
  if (chatId && !chatExists) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-[rgba(220,235,230,0.7)]">Чат не найден</p>
        <a
          href="/chat"
          className="glass-medium rounded-xl px-4 py-2 text-[13px] text-foreground transition-colors hover:border-mint/40"
        >
          На главную
        </a>
      </div>
    );
  }

  /* загрузка истории */
  if (chatId && (loading || !turns)) return <Skeletons />;

  /* пустой чат */
  if (!turns || turns.length === 0) {
    return chatId ? (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[rgba(220,235,230,0.6)]">
          Отправьте сообщение, чтобы начать
        </p>
      </div>
    ) : (
      <WelcomeScreen />
    );
  }

  return (
    <div className="scroll-area h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-5 py-6">
        {turns.map((turn, i) => {
          const prev = turns[i - 1];
          const showDivider =
            turn.kind === "agent" && prev?.kind === "agent" &&
            prev.agentState === "done" && turn.agentState === "running";
          return (
            <div key={turn.id} className="flex flex-col gap-7">
              {showDivider && (
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[rgba(220,235,230,0.62)]">
                    генерация
                  </span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
              )}
              {turn.kind === "user" ? (
                turn.status === "error" ? (
                  <div className="flex flex-col items-end gap-2">
                    <UserTurn turn={turn} />
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => window.location.reload()}
                      className="flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[11.5px] text-red-300 hover:bg-red-500/20"
                    >
                      <RefreshCw className="h-3 w-3" /> Повторить отправку
                    </motion.button>
                  </div>
                ) : (
                  <UserTurn turn={turn} />
                )
              ) : (
                <AgentTurn turn={turn} chatId={chatId!} />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
