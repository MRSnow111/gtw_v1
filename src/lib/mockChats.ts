import type { Chat } from "@/types/chat";

// TODO: заменить данными из сокета (chat.history / chat.title.updated). Пока — демо-список для интерфейса.
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const MOCK_CHATS: (Chat & { icon: "code" | "server" | "python" | "chart"; preview: string })[] = [
  { id: "1", title: "Разработка сайта", preview: "Собери лендинг на Next.js", icon: "code", userId: "me", createdAt: ago(5), updatedAt: ago(5) },
  { id: "2", title: "Настройка сервера", preview: "Подними nginx и сертификаты", icon: "server", userId: "me", createdAt: ago(60 * 25), updatedAt: ago(60 * 25) },
  { id: "3", title: "Python проект", preview: "Разбери парсер и добавь тесты", icon: "python", userId: "me", createdAt: ago(60 * 28), updatedAt: ago(60 * 28) },
  { id: "4", title: "Анализ данных", preview: "Построй график по CSV", icon: "chart", userId: "me", createdAt: ago(60 * 35), updatedAt: ago(60 * 35) },
];
