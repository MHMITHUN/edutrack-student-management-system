"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./Label";

export interface FieldProps {
  /** Human-readable label, always required. */
  label: string;
  /** Optional name to link label + control. Defaults to a generated id fragment. */
  name?: string;
  hint?: string;
  error?: string;
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean;
  className?: string;
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
  }) => React.ReactNode;
}

/**
 * Wire a label, hint, and error message to any form control via
 * aria-describedby + aria-invalid. Render-prop style so it works with
 * Input, Textarea, Select and future custom controls alike.
 */
export function Field({
  label,
  name,
  hint,
  error,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const id = name ? `field-${name}` : `field-${autoId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      {children({
        id,
        describedBy,
        invalid: Boolean(error),
        "aria-describedby": describedBy,
        "aria-invalid": error ? (true as const) : undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
