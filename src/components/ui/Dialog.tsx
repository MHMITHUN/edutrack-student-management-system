"use client";

import { useEffect, useRef, useId, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Native <dialog> based modal: showModal()/close(), Esc closes (cancel
 * event), focus returns to the previously focused element, aria-labelledby.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = useCallback(() => {
    restoreFocusRef.current?.focus();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault(); // keep <dialog> state in sync with React
      handleClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [handleClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === dialogRef.current) handleClose();
      }}
      className={cn(
        "m-auto w-full max-w-lg rounded-xl border border-border bg-surface p-0 shadow-lg",
        "backdrop:bg-fg/40",
        "open:flex open:flex-col",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-border p-4">
        <h2 id={titleId} className="text-base font-semibold text-fg">
          {title}
        </h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close dialog"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}
