export interface AdminUser {
  id: string;
  login: string;
  role: "admin" | "user";
  createdAt: string;
  lastLogin: string;
  isActive: boolean;
}

export interface AdminConfig {
  id: string;
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

export interface AdminPlugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  description: string;
  category: string;
}

export interface AdminSession {
  id: string;
  userId: string;
  userLogin: string;
  status: "active" | "idle" | "closed";
  createdAt: string;
  lastActivity: string;
  messageCount: number;
}

export interface AdminFile {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
  modifiedAt: string;
}

export interface AdminLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeSessions: number;
  activePlugins: number;
  errorRate: number;
  configChanges: number;
  uptime: string;
}
