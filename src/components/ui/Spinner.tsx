import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  /** Diameter in pixels. */
  size?: number;
  /** Accessible label; a bare spinner is aria-hidden. */
  label?: string;
}

export function Spinner({ size = 20, label, className, ...props }: SpinnerProps) {
  const spinner = (
    <Loader2
      width={size}
      height={size}
      className={cn("animate-spin text-muted", className)}
      aria-hidden={label ? undefined : true}
      {...props}
    />
  );
  if (!label) return spinner;
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      {spinner}
      {label}
    </span>
  );
}
