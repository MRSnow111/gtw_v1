import * as React from "react";
import { cn } from "@/lib/utils";

interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  loading?: boolean;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      icon,
      loading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const base =
      "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50";

    const variants = {
      primary:
        "rounded-full bg-gradient-to-r from-[#8FB8AE] to-[#4D7B73] text-[#0A1412] hover:from-[#9EC4BC] hover:to-[#5A8A80] hover:shadow-[0_0_24px_rgba(143,184,174,0.25)] active:scale-[0.98]",
      secondary:
        "rounded-full border border-[rgba(220,235,230,0.16)] bg-[rgba(143,184,174,0.07)] text-[rgba(220,235,230,0.8)] hover:bg-[rgba(143,184,174,0.13)] hover:border-[rgba(220,235,230,0.25)] active:scale-[0.98]",
      ghost:
        "rounded-lg text-[rgba(220,235,230,0.6)] hover:text-[rgba(220,235,230,0.9)] hover:bg-[rgba(143,184,174,0.08)] active:scale-[0.98]",
    };

    const sizes = {
      sm: "h-9 px-4 text-xs",
      md: "h-12 px-6 text-sm",
      lg: "h-14 px-8 text-base",
    };

    return (
      <button
        className={cn(base, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="31.4 31.4"
              strokeLinecap="round"
            />
          </svg>
        )}
        {!loading && icon && <span className="shrink-0">{icon}</span>}
        <span>{children}</span>
      </button>
    );
  },
);
GlassButton.displayName = "GlassButton";

export { GlassButton };
