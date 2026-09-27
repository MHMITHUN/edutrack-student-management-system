import type { Role } from "@/lib/db/types";

/**
 * Sidebar navigation per role. Icons are referenced by NAME (see
 * SidebarNav's client-side registry) — component references cannot cross
 * the server→client boundary. Extend here as new areas land; the AppShell
 * renders whichever section matches the signed-in user's role.
 */

/** Icon names available to nav items (resolved in SidebarNav.tsx). */
export type NavIcon =
  | "dashboard"
  | "award"
  | "attendance"
  | "bell"
  | "marks-entry"
  | "notices"
  | "users"
  | "classes"
  | "marks-review"
  | "audit"
  | "settings";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  STUDENT: [
    { href: "/student", label: "Dashboard", icon: "dashboard" },
    { href: "/student/results", label: "Results", icon: "award" },
    { href: "/student/attendance", label: "Attendance", icon: "attendance" },
    { href: "/student/notices", label: "Notices", icon: "bell" },
  ],
  TEACHER: [
    { href: "/teacher", label: "Dashboard", icon: "dashboard" },
    { href: "/teacher/marks", label: "Marks Entry", icon: "marks-entry" },
    { href: "/teacher/attendance", label: "Attendance", icon: "attendance" },
    { href: "/teacher/notices", label: "Notices", icon: "notices" },
  ],
  ADMIN: [
    { href: "/admin", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/users", label: "Users", icon: "users" },
    { href: "/admin/classes", label: "Classes", icon: "classes" },
    { href: "/admin/marks", label: "Marks Review", icon: "marks-review" },
    { href: "/admin/attendance", label: "Attendance", icon: "attendance" },
    { href: "/admin/notices", label: "Notices", icon: "notices" },
    { href: "/admin/audit", label: "Audit Log", icon: "audit" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

/** Where each role lands after sign-in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
};
