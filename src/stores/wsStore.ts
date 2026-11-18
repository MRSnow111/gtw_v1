import { create } from "zustand";
import type { Socket } from "socket.io-client";

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface WsStore {
  status: WsStatus;
  ws: Socket | null;
  setStatus: (status: WsStatus) => void;
  setWs: (ws: Socket | null) => void;
}

export const useWsStore = create<WsStore>((set) => ({
  status: "disconnected",
  ws: null,
  setStatus: (status) => set({ status }),
  setWs: (ws) => set({ ws }),
}));
