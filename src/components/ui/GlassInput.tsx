import * as React from "react";
import { cn } from "@/lib/utils";

interface GlassInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, label, error, type, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium text-[rgba(220,235,230,0.7)]">
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            "w-full rounded-xl border border-[rgba(220,235,230,0.12)] bg-[rgba(143,184,174,0.06)] px-4 py-3 text-sm text-[rgba(220,235,230,0.85)] placeholder:text-[rgba(220,235,230,0.35)] outline-none transition-all duration-200",
            "focus:border-[rgba(143,184,174,0.35)] focus:bg-[rgba(143,184,174,0.10)] focus:shadow-[0_0_0_1px_rgba(143,184,174,0.15)]",
            error &&
              "border-[rgba(220,80,80,0.6)] focus:border-[rgba(220,80,80,0.6)] focus:shadow-[0_0_0_1px_rgba(220,80,80,0.15)]",
            className,
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-xs text-[rgba(220,80,80,0.8)]">{error}</p>
        )}
      </div>
    );
  },
);
GlassInput.displayName = "GlassInput";

export { GlassInput };
