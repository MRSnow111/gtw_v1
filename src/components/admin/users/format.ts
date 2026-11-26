/** Формatters страницы /admin/users (волна 5, D1) — извлечены из page.tsx 1:1. */
import type { LimitInfo } from "./types";

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function formatDate(iso?: string | null): string {
  if (!iso || iso === "—") return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Подпись режима авто-сброса для колонки таблицы. */
export function resetLabel(u?: LimitInfo): string {
  const mode = u?.resetMode ?? "off";
  if (mode === "daily") return `Ежедневно ${String(u?.resetHour ?? 0).padStart(2, "0")}:00`;
  if (mode === "weekly") return `Еженедельно (${WEEKDAYS[(u?.resetDay ?? 1) - 1]})`;
  if (mode === "monthly") return `Ежемесячно (${u?.resetDay ?? 1}-го)`;
  return "Выкл";
}

/** Цвет полосы расхода токенов: ≥100 % красный, ≥80 % жёлтый, иначе мятный. */
export function usageBarClass(pct: number): string {
  if (pct >= 100) return "bg-[rgba(220,112,112,0.8)]";
  if (pct >= 80) return "bg-[#F0C040]";
  return "bg-[#75D6A8]";
}
