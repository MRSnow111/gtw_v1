import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  variant?: "green" | "yellow" | "red" | "blue" | "gray";
  label?: string;
}

type DotColor = "green" | "yellow" | "red" | "blue" | "gray";

const statusMap: Record<string, { dot: DotColor; label: string }> = {
  active: { dot: "green", label: "Активна" },
  idle: { dot: "yellow", label: "Ожидание" },
  closed: { dot: "gray", label: "Закрыта" },
  enabled: { dot: "green", label: "Включён" },
  disabled: { dot: "red", label: "Отключён" },
  error: { dot: "red", label: "Ошибка" },
  warn: { dot: "yellow", label: "Предупреждение" },
  info: { dot: "blue", label: "Информация" },
  debug: { dot: "gray", label: "Отладка" },
};

const dotColors: Record<DotColor, string> = {
  green: "bg-[#75D6A8]",
  yellow: "bg-[#F0C040]",
  red: "bg-[#E8605A]",
  blue: "bg-[#6BA3D6]",
  gray: "bg-[rgba(165,187,179,0.4)]",
};

export function StatusBadge({ status, variant, label }: StatusBadgeProps) {
  const found = statusMap[status.toLowerCase()];
  const dot: DotColor = found ? found.dot : (variant ?? "gray");
  const textLabel = found ? found.label : (label ?? status);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(220,235,230,0.1)] bg-[rgba(143,184,174,0.06)] px-2.5 py-1 text-[11px] text-[rgba(220,235,230,0.6)]">
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[dot])} />
      {textLabel}
    </span>
  );
}
