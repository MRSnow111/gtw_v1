import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  dot?: "green" | "yellow" | "red";
}

export function Badge({ className, dot, children, ...props }: BadgeProps) {
  const dotColors = {
    green: "bg-[#75D6A8]",
    yellow: "bg-[#F0C040]",
    red: "bg-[#E8605A]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[rgba(220,235,230,0.12)] bg-[rgba(143,184,174,0.07)] px-3 py-1 text-xs text-[rgba(220,235,230,0.65)]",
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[dot])} />}
      {children}
    </span>
  );
}
