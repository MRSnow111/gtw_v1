"use client";

import { useWsStore } from "@/stores/wsStore";
import { MoreHorizontal, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatHeader({ chatId }: { chatId: string }) {
  const { status, setStatus } = useWsStore();

  const getStatusColor = () => {
    switch (status) {
      case "connected": return "text-green-500";
      case "reconnecting": return "text-yellow-500";
      default: return "text-red-500";
    }
  };

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-2">
        <span className="font-medium">Анализ отчета</span>
        <span className="text-xs text-muted-foreground">|</span>
        <span className="text-xs text-muted-foreground">hermes-fast</span>
      </div>
      
      <div className="flex items-center gap-2">
        <button onClick={() => setStatus(status === "connected" ? "disconnected" : "connected")}>
          {status === "connected" ? (
            <Wifi className={`h-4 w-4 ${getStatusColor()}`} />
          ) : status === "reconnecting" ? (
            <RefreshCw className={`h-4 w-4 ${getStatusColor()} animate-spin`} />
          ) : (
            <WifiOff className={`h-4 w-4 ${getStatusColor()}`} />
          )}
        </button>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
