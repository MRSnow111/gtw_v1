import { create } from "zustand";

export type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface WsStore {
  status: WsStatus;
  setStatus: (status: WsStatus) => void;
}

// Волна 3: поля ws/setWs удалены — 0 использований (сокет живёт в src/lib/gtwSocket.ts).
export const useWsStore = create<WsStore>((set) => ({
  status: "disconnected",
  setStatus: (status) => set({ status }),
}));