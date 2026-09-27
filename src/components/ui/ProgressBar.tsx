import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  /** 0-100. Values outside the range are clamped. */
  value: number;
  /** Accessible name for the progress bar. */
  label: string;
  className?: string;
  /** Render the numeric value next to the bar. */
  showValue?: boolean;
}

export function ProgressBar({
  value,
  label,
  className,
  showValue = true,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showValue && (
        <span className="w-10 shrink-0 text-right text-xs font-medium text-muted">
          {clamped}%
        </span>
      )}
    </div>
  );
}
