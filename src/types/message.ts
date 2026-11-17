export type Role = "user" | "assistant" | "system" | "tool" | "error";

export interface Message {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  metadata?: Record<string, any>;
  createdAt: string;
  status?: "pending" | "streaming" | "done" | "error" | "cancelled";
}

export interface Attachment {
  fileId: string;
  name: string;
  mime: string;
  size: number;
  url?: string;
  previewUrl?: string;
  status: "uploading" | "ready" | "failed";
}
