import { create } from "zustand";

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface WsStore {
  status: WsStatus;
  ws: WebSocket | null;
  setStatus: (status: WsStatus) => void;
  setWs: (ws: WebSocket | null) => void;
}

export const useWsStore = create<WsStore>((set) => ({
  status: "disconnected",
  ws: null,
  setStatus: (status) => set({ status }),
  setWs: (ws) => set({ ws }),
}));