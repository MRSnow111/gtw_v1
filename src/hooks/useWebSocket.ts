"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useWsStore, WsStatus } from "@/stores/wsStore";
import type { ServerEvent } from "@/types/events";

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";

export function useWebSocket() {
  const { status, setStatus, setWs } = useWsStore();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (socketRef.current?.connected) return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: false,
    });

    socketRef.current = socket;
    setWs(socket);

    const handleConnect = () => {
      console.log("[WS] Connected");
      setStatus("connected");
    };

    const handleDisconnect = (reason: string) => {
      console.log(`[WS] Disconnected: ${reason}`);
      setStatus("disconnected");
    };

    const handleReconnect = (reason: string) => {
      console.log(`[WS] Reconnected: ${reason}`);
      setStatus("connected");
    };

    const handleReconnectAttempt = (num: number) => {
      console.log(`[WS] Reconnect attempt: ${num}`);
      setStatus("reconnecting");
    };

    const handleMessage = (data: ServerEvent) => {
      console.log("[WS] Message:", data.type, data);
      // TODO: Route messages to stores based on type
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect", handleReconnect);
    socket.on("reconnect_attempt", handleReconnectAttempt);
    socket.on("message", handleMessage); // Adjust event name as needed

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("reconnect", handleReconnect);
      socket.off("reconnect_attempt", handleReconnectAttempt);
      socket.off("message", handleMessage);
      // Don't destroy socket on unmount, keep it alive
    };
  }, []);

  const sendMessage = (data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("message", data);
    } else {
      console.warn("[WS] Cannot send: not connected");
    }
  };

  return { sendMessage };
}
