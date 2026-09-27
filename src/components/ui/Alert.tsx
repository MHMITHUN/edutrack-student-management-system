import type { LucideIcon } from "lucide-react";
import { Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertTone = "info" | "success" | "warning" | "danger";

const toneClasses: Record<AlertTone, string> = {
  info: "border-accent/30 bg-accent/5 text-fg",
  success: "border-success/30 bg-success/5 text-fg",
  warning: "border-warning/30 bg-warning/5 text-fg",
  danger: "border-danger/30 bg-danger/5 text-fg",
};

const toneIconClasses: Record<AlertTone, string> = {
  info: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const toneIcons: Record<AlertTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  /** Optional heading rendered next to the icon. */
  title?: string;
}

export function Alert({ tone = "info", title, className, children, ...props }: AlertProps) {
  const Icon = toneIcons[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", toneIconClasses[tone])} aria-hidden="true" />
      <div className="flex flex-col gap-1">
        {title && <p className="font-semibold text-fg">{title}</p>}
        <div className="text-fg">{children}</div>
      </div>
    </div>
  );
}
