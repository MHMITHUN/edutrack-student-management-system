import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Native select, styled to match Input. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, invalid = false, children, ...props }, ref) {
    return (
      <div className={cn("relative", className)}>
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-10 w-full appearance-none rounded-lg border bg-surface pl-3 pr-9 text-sm text-fg",
            "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            invalid ? "border-danger" : "border-border",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </div>
    );
  },
);
