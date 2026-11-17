export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  status?: "active" | "archived" | "deleted";
}

export type ChatStatus = "connected" | "disconnected" | "reconnecting" | "thinking" | "generating" | "idle";
