"use client";

import type { Chat } from "@/types/chat";

/* ─────────────── Types ─────────────── */

export type ToolStatus = "running" | "ok" | "error" | "cancelled";
export type ApprovalState = "pending" | "allowed" | "denied" | "expired";

export interface ToolCall {
  id: string;
  tool: string;
  arg: string;
  argsFull?: string;
  status: ToolStatus;
  output: string;
}

export interface Approval {
  id: string;
  command: string;
  state: ApprovalState;
  comment?: string;
  description?: string;
  actions?: { label: string; choice: string; style?: string }[];
}

export interface Clarify {
  id: string;
  question: string;
  choices: string[];
  multiSelect?: boolean;
  state: "pending" | "answered";
  answer?: string;
}

export interface UserAttachment {
  name: string;
  size: string;
  status: "uploading" | "ready" | "failed";
  progress?: number;
}

export interface Turn {
  id: string;
  kind: "user" | "agent";
  createdAt: number;

  // user turn
  text?: string;
  attachments?: UserAttachment[];
  status?: "pending" | "done" | "error" | "cancelled";

  // agent turn
  messageId?: string; // id сообщения шлюза (для message_edit)
  thinkingMs?: number | null; // null = ещё думает
  tools?: ToolCall[];
  answer?: string;
  revealed?: number; // сколько символов ответа показано (стриминг)
  approval?: Approval;
  clarify?: Clarify;
  usage?: { inTokens: number; outTokens: number; durationMs: number };
  agentState?: "running" | "done" | "cancelled" | "error";
}

export type DemoChat = Chat & { kind: "chat" | "terminal" | "data" };

export type ArtifactKind = "code" | "image" | "other";

export interface Artifact {
  id: string;
  chatId: string;
  name: string;
  kind: ArtifactKind;
  size: string;
  updatedAt: string;
  content?: string;
  lang?: string;
  url?: string;
  error?: boolean;
}

export interface Command {
  name: string;
  description: string;
}

/* ─────────────── Seed data ─────────────── */

const now = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;

export const DEMO_USER = { name: "MRSnow", role: "владелец" };

export const seedChats: DemoChat[] = [
  { id: "c1", title: "Рефакторинг API-клиента", userId: "u1", createdAt: new Date(now - 40 * MIN).toISOString(), updatedAt: new Date(now - 2 * MIN).toISOString(), kind: "chat" },
  { id: "c2", title: "Анализ логов сервера", userId: "u1", createdAt: new Date(now - 3 * HOUR).toISOString(), updatedAt: new Date(now - 50 * MIN).toISOString(), kind: "terminal" },
  { id: "c3", title: "Отчёт по метрикам за октябрь", userId: "u1", createdAt: new Date(now - 26 * HOUR).toISOString(), updatedAt: new Date(now - 5 * HOUR).toISOString(), kind: "data" },
  { id: "c4", title: "Схема БД для заказов", userId: "u1", createdAt: new Date(now - 3 * 24 * HOUR).toISOString(), updatedAt: new Date(now - 2 * 24 * HOUR).toISOString(), kind: "chat" },
  { id: "c5", title: "Настройка CI-пайплайна", userId: "u1", createdAt: new Date(now - 9 * 24 * HOUR).toISOString(), updatedAt: new Date(now - 8 * 24 * HOUR).toISOString(), kind: "terminal" },
  { id: "c6", title: "Миграция на новый линтер", userId: "u1", createdAt: new Date(now - 20 * 24 * HOUR).toISOString(), updatedAt: new Date(now - 19 * 24 * HOUR).toISOString(), kind: "chat" },
];

const pyCode = `import asyncio
from gtw.agent import Hermes

async def main():
    agent = Hermes(model="hermes-fast")
    result = await agent.run(
        prompt="Собери отчёт по логам за сутки",
        tools=["terminal", "fs.read"],
    )
    print(result.summary)

if __name__ == "__main__":
    asyncio.run(main())
`;

const chartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300">
  <rect width="480" height="300" fill="#0A1412"/>
  <g fill="#8FB8AE">
    <rect x="60" y="200" width="40" height="60" rx="6" opacity="0.55"/>
    <rect x="130" y="150" width="40" height="110" rx="6" opacity="0.7"/>
    <rect x="200" y="180" width="40" height="80" rx="6" opacity="0.6"/>
    <rect x="270" y="100" width="40" height="160" rx="6" opacity="0.85"/>
    <rect x="340" y="60" width="40" height="200" rx="6"/>
  </g>
  <text x="60" y="285" fill="#DCEBE6" font-family="monospace" font-size="13">Пн Вт Ср Чт Пт</text>
  <text x="60" y="36" fill="#DCEBE6" font-family="monospace" font-size="16">Запросы к агенту, шт/день</text>
</svg>`;

export const seedArtifacts: Artifact[] = [
  {
    id: "a1", chatId: "c1", name: "agent_client.py", kind: "code", lang: "python",
    size: "1.2 КБ", updatedAt: new Date(now - 4 * MIN).toISOString(), content: pyCode,
  },
  {
    id: "a2", chatId: "c1", name: "requests_chart.svg", kind: "image",
    size: "48 КБ", updatedAt: new Date(now - 6 * MIN).toISOString(), url: chartSvg,
  },
  {
    id: "a3", chatId: "c1", name: "report_october.pdf", kind: "other",
    size: "1.4 МБ", updatedAt: new Date(now - 10 * MIN).toISOString(),
  },
  {
    id: "a4", chatId: "c1", name: "metrics.json", kind: "code", lang: "json",
    size: "12 КБ", updatedAt: new Date(now - 12 * MIN).toISOString(), error: true,
  },
];

const longToolOutput = Array.from({ length: 64 }, (_, i) =>
  `[build] step ${i + 1}: compiled src/components/chat/Module${i + 1}.tsx in ${120 + i}ms`
).join("\n");

export const seedTurns: Record<string, Turn[]> = {
  c1: [
    {
      id: "t1", kind: "user", createdAt: now - 42 * MIN,
      text: "Посмотри наш API-клиент и предложи, как его отрефакторить. Вот текущий код:",
      attachments: [{ name: "client.ts", size: "8 КБ", status: "ready" }],
      status: "done",
    },
    {
      id: "t2", kind: "agent", createdAt: now - 41 * MIN,
      thinkingMs: 4200,
      agentState: "done",
      tools: [
        {
          id: "tc1", tool: "fs.read", arg: "src/lib/api/client.ts", status: "ok",
          output: "// client.ts — 214 строки\nexport class ApiClient { /* … */ }\n",
        },
        {
          id: "tc2", tool: "terminal", arg: "npm run typecheck", status: "ok",
          argsFull: "npm run typecheck -- --project tsconfig.json",
          output: longToolOutput.slice(0, 900) + "\n… (полный вывод доступен по кнопке)",
        },
      ],
      answer: `## Разбор текущего клиента

Клиент написан аккуратно, но у него три слабых места:

1. **Дублирование обработки ошибок** — один и тот же \`try/catch\` повторяется в 12 методах.
2. **Нет таймаутов** — запрос может висеть бесконечно.
3. **Слабая типизация ответов** — все методы возвращают \`any\`.

### Предлагаемый план

| Шаг | Что делаем | Риск |
|---|---|---|
| 1 | Единый \`request()\` с интерцепторами | низкий |
| 2 | \`AbortSignal.timeout(10_000)\` по умолчанию | низкий |
| 3 | Дженерики \`request<T>(…)\` вместо \`any\` | средний |

> После шага 3 половина ручных проверок типов станет не нужна — компилятор сам подсветит расхождения.

Пример того, как может выглядеть ядро:

\`\`\`ts
export async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(init?.timeoutMs ?? 10_000),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}
\`\`\`

Могу сразу применить шаги 1–2 к \`client.ts\`.`,
      usage: { inTokens: 1840, outTokens: 962, durationMs: 8400 },
    },
    {
      id: "t3", kind: "user", createdAt: now - 30 * MIN,
      text: "Да, применяй. И прогони тесты после.", status: "done",
    },
    {
      id: "t4", kind: "agent", createdAt: now - 29 * MIN,
      thinkingMs: 2100, agentState: "done",
      tools: [
        { id: "tc3", tool: "fs.write", arg: "src/lib/api/client.ts", status: "ok", output: "Файл обновлён: +34 / −61 строк." },
        { id: "tc4", tool: "terminal", arg: "npm test", status: "error", output: "FAIL src/lib/api/client.test.ts\n● ApiClient › retries on 5xx\n  expect(received).toBe(3) // 2" },
      ],
      answer: "Применил шаги 1–2. Тесты упали: ретрай-политика теперь считает попытки иначе, поправлю в следующем ходе.",
      approval: {
        id: "ap2", command: "npm test -- --watchAll=false",
        state: "allowed", comment: "ок, прогоняй",
      },
      usage: { inTokens: 920, outTokens: 214, durationMs: 6100 },
    },
    {
      id: "t5", kind: "agent", createdAt: now - 12 * MIN,
      thinkingMs: null, agentState: "running", tools: [],
      answer: "Смотрю тест ретраев — вероятно, понадобится вынести политику в отдельный модуль…",
      revealed: 0,
    },
  ],
  c2: [
    {
      id: "t1", kind: "user", createdAt: now - 55 * MIN,
      text: "Найди в логах ошибки за последние сутки", status: "done",
    },
    {
      id: "t2", kind: "agent", createdAt: now - 54 * MIN,
      thinkingMs: 1800, agentState: "done",
      tools: [{ id: "tc1", tool: "terminal", arg: "grep -c ERROR app.log", status: "ok", output: "37" }],
      answer: "За сутки в \`app.log\` **37 ошибок**. Основная масса — таймауты внешнего API платежей (31 шт.), остальное — два падения воркера и четыре 404 на устаревших роутах.",
      usage: { inTokens: 610, outTokens: 128, durationMs: 3400 },
    },
  ],
};

export const seedCommands: Command[] = [
  { name: "/stop", description: "Остановить текущую генерацию" },
  { name: "/new", description: "Создать новый чат" },
  { name: "/clear", description: "Очистить контекст чата" },
  { name: "/model", description: "Показать текущую модель агента" },
  { name: "/help", description: "Список доступных команд" },
];

/* ─────────────── Helpers ─────────────── */

export function groupChats(chats: DemoChat[]): { label: string; chats: DemoChat[] }[] {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();
  const weekStart = dayStart - 6 * 24 * HOUR;

  const sorted = [...chats].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const groups: { label: string; chats: DemoChat[] }[] = [
    { label: "Сегодня", chats: [] },
    { label: "На этой неделе", chats: [] },
    { label: "Ранее", chats: [] },
  ];
  for (const c of sorted) {
    const t = +new Date(c.updatedAt);
    if (t >= dayStart) groups[0].chats.push(c);
    else if (t >= weekStart) groups[1].chats.push(c);
    else groups[2].chats.push(c);
  }
  return groups.filter((g) => g.chats.length > 0);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
