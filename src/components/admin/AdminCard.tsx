import { cn } from "@/lib/utils";

interface AdminCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "light" | "medium" | "strong";
}

export function AdminCard({
  className,
  variant = "medium",
  title,
  subtitle,
  icon,
  action,
  children,
  ...props
}: AdminCardProps) {
  const glassClass = {
    light: "glass-light",
    medium: "glass-medium",
    strong: "glass-strong",
  }[variant];

  return (
    <div
      className={cn(
        glassClass,
        "rounded-[24px] p-6 flex flex-col gap-4",
        "transition-all duration-200",
        className,
      )}
      {...props}
    >
      {(title || icon || action) && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {icon && <span className="text-[rgba(143,184,174,0.8)]">{icon}</span>}
            <div>
              {title && (
                <h3 className="text-sm font-semibold text-[rgba(220,235,230,0.9)]">{title}</h3>
              )}
              {subtitle && (
                <p className="text-xs text-[rgba(165,187,179,0.6)] mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}
