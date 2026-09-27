import Link from "next/link";
import { GraduationCap } from "lucide-react";
import type { User } from "@/lib/db/types";
import { NAV_BY_ROLE, ROLE_LABELS } from "@/lib/nav";
import { logoutAction } from "@/app/actions/auth";
import { SidebarNav } from "./SidebarNav";

/**
 * App shell for logged-in areas: sticky header (brand + user + logout),
 * role sidebar on desktop and a compact scrollable nav strip on mobile.
 * Server component — reads nothing itself, receives the session user.
 */
export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const items = NAV_BY_ROLE[user.role];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface print:hidden">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <GraduationCap className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-fg">EduTrack</span>
              <span className="text-[11px] text-muted">
                Student Management
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span
              className="hidden text-right text-sm leading-tight sm:block"
            >
              <span className="block font-medium text-fg">{user.name}</span>
              <span className="block text-xs text-muted">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block print:hidden">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <SidebarNav items={items} />
            <p className="px-6 pb-4 pt-2 text-[11px] leading-relaxed text-muted">
              EduTrack Demo School
              <br />
              Academic year 2026
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile nav strip */}
          <nav
            aria-label="Section"
            className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-2 lg:hidden print:hidden"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8 print:max-w-none print:p-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
