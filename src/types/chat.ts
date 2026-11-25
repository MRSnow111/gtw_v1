export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  projectId?: string | null;
  status?: "active" | "archived" | "deleted";
}

