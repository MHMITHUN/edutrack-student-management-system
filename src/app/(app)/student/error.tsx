"use client";

import { CircleAlert } from "lucide-react";

/** Student section error boundary — honest message + a retry. */
export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface p-10 text-center"
    >
      <CircleAlert className="size-10 text-danger" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-fg">This page failed to load</h1>
        <p className="max-w-md text-sm text-muted">
          {error.message || "An unexpected error occurred while reading the store."}
          {error.digest && (
            <span className="mt-1 block font-mono text-xs">digest: {error.digest}</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Try again
      </button>
    </div>
  );
}
