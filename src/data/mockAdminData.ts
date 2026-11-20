import {
  DashboardStats,
  AdminConfig,
  AdminUser,
  AdminPlugin,
  AdminSession,
  AdminFile,
  AdminLog,
} from "@/types/admin";

// ── Dashboard Stats ──
export const mockStats: DashboardStats = {
  totalUsers: 12,
  activeSessions: 5,
  activePlugins: 8,
  errorRate: 1.2,
  configChanges: 23,
  uptime: "14д 7ч 32м",
};

// ── Config ──
export const mockConfig: AdminConfig[] = [
  { id: "1", key: "HERMES_HOST", value: "hermes@mimiric.ru", description: "Хост агента Hermes", updatedAt: "2026-11-19T10:00:00Z" },
  { id: "2", key: "HERMES_PORT", value: "9119", description: "Порт SSH-туннеля", updatedAt: "2026-11-19T10:00:00Z" },
  { id: "3", key: "SESSION_TIMEOUT", value: "3600", description: "Таймаут сессии в секундах", updatedAt: "2026-11-18T15:30:00Z" },
  { id: "4", key: "MAX_MESSAGES", value: "100", description: "Максимум сообщений в чате", updatedAt: "2026-11-17T09:00:00Z" },
  { id: "5", key: "LOG_RETENTION_DAYS", value: "30", description: "Хранение логов в днях", updatedAt: "2026-11-16T12:00:00Z" },
  { id: "6", key: "DEMO_MODE", value: "false", description: "Демо-режим без шлюза", updatedAt: "2026-11-15T08:00:00Z" },
  { id: "7", key: "AUTH_TOKEN_TTL", value: "604800", description: "TTL токена авторизации (сек)", updatedAt: "2026-11-14T14:00:00Z" },
  { id: "8", key: "RATE_LIMIT", value: "60", description: "Лимит запросов в минуту", updatedAt: "2026-11-13T11:00:00Z" },
];

// ── Users ──
export const mockUsers: AdminUser[] = [
  { id: "1", login: "admin", role: "admin", createdAt: "2026-01-01T00:00:00Z", lastLogin: "2026-11-20T08:30:00Z", isActive: true },
  { id: "2", login: "demo", role: "user", createdAt: "2026-03-15T00:00:00Z", lastLogin: "2026-11-19T14:20:00Z", isActive: true },
  { id: "3", login: "operator", role: "user", createdAt: "2026-05-20T00:00:00Z", lastLogin: "2026-11-18T09:15:00Z", isActive: true },
  { id: "4", login: "testuser", role: "user", createdAt: "2026-07-10T00:00:00Z", lastLogin: "2026-10-01T12:00:00Z", isActive: false },
];

// ── Plugins ──
export const mockPlugins: AdminPlugin[] = [
  { id: "1", name: "hermes-connector", version: "2.1.0", enabled: true, description: "Основной коннектор к Hermes", category: "core" },
  { id: "2", name: "auth-middleware", version: "1.3.2", enabled: true, description: "Авторизация и валидация", category: "security" },
  { id: "3", name: "rate-limiter", version: "1.0.5", enabled: true, description: "Ограничение запросов", category: "security" },
  { id: "4", name: "log-rotator", version: "1.2.0", enabled: true, description: "Ротация логов", category: "utility" },
  { id: "5", name: "file-manager", version: "0.9.1", enabled: false, description: "Управление файлами", category: "utility" },
  { id: "6", name: "analytics", version: "1.1.0", enabled: true, description: "Аналитика и метрики", category: "monitoring" },
  { id: "7", name: "websocket-relay", version: "2.0.3", enabled: true, description: "WS-прокси", category: "core" },
  { id: "8", name: "artifact-store", version: "1.4.1", enabled: true, description: "Хранение артефактов", category: "storage" },
];

// ── Sessions ──
export const mockSessions: AdminSession[] = [
  { id: "s1", userId: "1", userLogin: "admin", status: "active", createdAt: "2026-11-20T08:30:00Z", lastActivity: "2026-11-20T12:45:00Z", messageCount: 47 },
  { id: "s2", userId: "2", userLogin: "demo", status: "active", createdAt: "2026-11-19T14:20:00Z", lastActivity: "2026-11-20T11:30:00Z", messageCount: 23 },
  { id: "s3", userId: "3", userLogin: "operator", status: "idle", createdAt: "2026-11-18T09:15:00Z", lastActivity: "2026-11-18T16:00:00Z", messageCount: 12 },
  { id: "s4", userId: "2", userLogin: "demo", status: "closed", createdAt: "2026-11-15T10:00:00Z", lastActivity: "2026-11-19T14:15:00Z", messageCount: 5 },
  { id: "s5", userId: "1", userLogin: "admin", status: "closed", createdAt: "2026-11-10T07:00:00Z", lastActivity: "2026-11-19T08:00:00Z", messageCount: 89 },
];

// ── Files ──
export const mockFiles: AdminFile[] = [
  { id: "1", name: "config.yaml", size: 2048, type: "yaml", createdAt: "2026-11-15T10:00:00Z", modifiedAt: "2026-11-20T09:00:00Z" },
  { id: "2", name: "plugins.db", size: 1048576, type: "database", createdAt: "2026-10-01T00:00:00Z", modifiedAt: "2026-11-19T12:00:00Z" },
  { id: "3", name: "sessions.json", size: 51200, type: "json", createdAt: "2026-11-01T00:00:00Z", modifiedAt: "2026-11-20T08:30:00Z" },
  { id: "4", name: "artifacts/", size: 52428800, type: "directory", createdAt: "2026-09-15T00:00:00Z", modifiedAt: "2026-11-18T14:00:00Z" },
  { id: "5", name: "logs/", size: 3145728, type: "directory", createdAt: "2026-09-15T00:00:00Z", modifiedAt: "2026-11-20T12:00:00Z" },
  { id: "6", name: "backup_20261115.tar.gz", size: 10485760, type: "archive", createdAt: "2026-11-15T00:00:00Z", modifiedAt: "2026-11-15T00:00:00Z" },
];

// ── Logs ──
const logTemplates: Array<{ level: AdminLog["level"]; message: string; source: string }> = [
  { level: "info", message: "Сессия создана для пользователя admin", source: "auth" },
  { level: "info", message: "Конфигурация перезагружена (live-reload)", source: "config" },
  { level: "debug", message: "WS-соединение установлено", source: "websocket" },
  { level: "info", message: "Запрос к Hermes обработан (234ms)", source: "gateway" },
  { level: "warn", message: "Плагин file-manager отключён", source: "plugin-manager" },
  { level: "error", message: "Таймаут соединения с агентом", source: "gateway" },
  { level: "info", message: "Пользователь demo вошёл в систему", source: "auth" },
  { level: "debug", message: "Heartbeat отправлен", source: "websocket" },
  { level: "info", message: "Лог ротация выполнена (30д)", source: "log-rotator" },
  { level: "warn", message: "Высокая задержка: 1200ms", source: "gateway" },
  { level: "info", message: "Плагин analytics обновлён до 1.1.0", source: "plugin-manager" },
  { level: "error", message: "Ошибка парсинга ответа от агента", source: "gateway" },
  { level: "info", message: "Сессия s4 закрыта пользователем", source: "session" },
  { level: "debug", message: "Кеш конфигов обновлён", source: "config" },
  { level: "info", message: "Артефакт saved_artifact_001 сохранён", source: "artifact-store" },
];

function generateLogs(count: number): AdminLog[] {
  const logs: AdminLog[] = [];
  for (let i = 0; i < count; i++) {
    const template = logTemplates[Math.floor(Math.random() * logTemplates.length)];
    const hoursAgo = Math.floor(Math.random() * 720); // 30 дней
    const ts = new Date(Date.now() - hoursAgo * 3600_000);
    logs.push({
      id: `log-${i}`,
      timestamp: ts.toISOString(),
      level: template.level,
      message: template.message,
      source: template.source,
    });
  }
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export const mockLogs = generateLogs(200);
