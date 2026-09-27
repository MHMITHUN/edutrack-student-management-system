import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { getStore } from "@/lib/db";
import type { User } from "@/lib/db/types";

/**
 * Auth guards (roles: ADMIN | TEACHER | STUDENT).
 * - Pages / server components: getSessionUser, requireUser, requireRole
 * - Route handlers: apiGuard (returns 401/403 NextResponse)
 * - NO middleware.ts — every protected surface guards itself.
 *
 * Domain rules enforced downstream (server-side, never trusting the client):
 * teachers only touch marks/attendance for THEIR assigned class+subject;
 * students only see PUBLISHED results and their OWN records.
 */

/** Resolve the signed-in user, or null. Token role is cross-checked with the store. */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const store = await getStore();
  const user = await store.getUserById(payload.uid);
  if (!user) return null;
  if (user.status !== "active") return null;

  // A token can outlive a stored role change — the store is the source of truth.
  if (user.role !== payload.role) return null;
  return user;
}

/**
 * Page guard: redirect to /login when unauthenticated.
 * `redirectTo` is the path to return to after signing in (e.g. "/admin").
 */
export async function requireUser(redirectTo?: string): Promise<User> {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      redirectTo ? `/login?next=${encodeURIComponent(redirectTo)}` : "/login",
    );
  }
  return user;
}

/**
 * Page guard: require one of the given roles. Unauthenticated users go to
 * /login; authenticated users without the role go to /403.
 */
export async function requireRole(
  roles: Array<User["role"]>,
  redirectTo?: string,
): Promise<User> {
  const user = await requireUser(redirectTo);
  if (!roles.includes(user.role)) {
    redirect("/403");
  }
  return user;
}

/**
 * Route-handler guard. Returns { user } on success, or a 401/403
 * NextResponse the handler should return directly.
 */
export async function apiGuard(
  _req: NextRequest,
  roles?: Array<User["role"]>,
): Promise<{ user: User } | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }
  if (roles && !roles.includes(user.role)) {
    return {
      response: NextResponse.json(
        { error: "You do not have permission to do that." },
        { status: 403 },
      ),
    };
  }
  return { user };
}
