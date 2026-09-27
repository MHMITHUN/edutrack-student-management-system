import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * The only public page — EduTrack is an internal school system, so the
 * login screen is the front door (no public marketing site).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : undefined;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Sign in to EduTrack
        </h1>
        <p className="text-sm text-muted">
          EduTrack Demo School — marks, attendance, results and notices for
          students, teachers and administrators.
        </p>
      </div>
      <LoginForm next={safeNext} />
      <div className="rounded-lg border border-border bg-surface-2 p-4 text-xs text-muted">
        <p className="font-medium text-fg">Demo accounts (password Demo@12345)</p>
        <ul className="mt-2 space-y-1 font-mono">
          <li>admin@demo.local — Administrator</li>
          <li>teacher@demo.local — Teacher</li>
          <li>student@demo.local — Student</li>
        </ul>
        <p className="mt-2">
          Accounts are managed by the school administrator; there is no public
          registration.
        </p>
      </div>
    </div>
  );
}
