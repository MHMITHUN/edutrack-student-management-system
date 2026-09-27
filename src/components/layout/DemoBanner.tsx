import { Info } from "lucide-react";

/**
 * Honest demo-mode label (spec section 36): shown whenever the app is
 * running on the in-memory DemoStore (MONGODB_URI absent).
 */
export function DemoBanner() {
  if (process.env.MONGODB_URI) return null;

  return (
    <div
      role="status"
      className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center sm:px-6 print:hidden"
    >
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 text-xs text-warning">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        Demo mode: sample school data, resets on restart. Set MONGODB_URI
        (see .env.example) for persistence.
      </p>
    </div>
  );
}
