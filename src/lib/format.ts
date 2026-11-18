import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

export function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Вчера, ${format(d, "HH:mm")}`;
  return format(d, "d MMM", { locale: ru });
}

export type ChatGroup = "Сегодня" | "Вчера" | "На этой неделе" | "Ранее";

export function chatGroup(iso: string): ChatGroup {
  const d = new Date(iso);
  if (isToday(d)) return "Сегодня";
  if (isYesterday(d)) return "Вчера";
  const days = (Date.now() - d.getTime()) / 86_400_000;
  return days < 7 ? "На этой неделе" : "Ранее";
}
