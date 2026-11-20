import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "light" | "medium" | "strong";
  glow?: boolean;
}

export function GlassCard({
  className,
  variant = "medium",
  glow = false,
  children,
  ...props
}: GlassCardProps) {
  const glassClass = {
    light: "glass-light",
    medium: "glass-medium",
    strong: "glass-strong",
  }[variant];

  return (
    <div
      className={cn(
        glassClass,
        "rounded-[24px] p-6",
        glow && "glass-hover",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
