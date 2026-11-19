"use client";

import { useEffect } from "react";
import { gtwSocket } from "@/lib/gtwSocket";
import { useWsStore } from "@/stores/wsStore";
import { DEMO_MODE } from "@/stores/agentStore";

/** Монтируется один раз в AppShell: держит WS-соединение с прокси /ws. */
export function useWebSocket() {
  const setStatus = useWsStore((s) => s.setStatus);

  useEffect(() => {
    if (DEMO_MODE) {
      setStatus("connected");
      return;
    }
    const off = gtwSocket.onStatus(setStatus);
    gtwSocket.start();
    return () => {
      off();
    };
  }, [setStatus]);
}