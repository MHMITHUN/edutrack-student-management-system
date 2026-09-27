import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Access denied",
};

export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-2">
        <ShieldAlert className="size-7 text-muted" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold text-fg">Access denied</h1>
      <p className="text-sm text-muted">
        You do not have permission to view this page. Students, teachers and
        administrators each see their own areas — if you believe this is a
        mistake, contact the school administrator.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Back to home
      </Link>
    </div>
  );
}
