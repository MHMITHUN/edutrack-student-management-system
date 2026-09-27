"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Bell,
  CalendarCheck,
  ClipboardCheck,
  ClipboardEdit,
  LayoutDashboard,
  Megaphone,
  School,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavIcon, NavItem } from "@/lib/nav";

/**
 * Role sidebar links with active-state highlighting (client component only
 * because active state needs the current pathname). Icons live HERE, in a
 * name-keyed registry — server code passes plain strings across the
 * server→client boundary, never component references.
 */

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  award: Award,
  attendance: CalendarCheck,
  bell: Bell,
  "marks-entry": ClipboardEdit,
  notices: Megaphone,
  users: Users,
  classes: School,
  "marks-review": ClipboardCheck,
  audit: ScrollText,
  settings: Settings,
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Section" className="flex flex-col gap-1 px-3 py-4">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICONS[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active
                ? "bg-accent/10 font-medium text-accent"
                : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
