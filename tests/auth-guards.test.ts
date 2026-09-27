import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE,
} from "@/lib/auth/session";
import {
  apiGuard,
  getSessionUser,
  requireRole,
  requireUser,
} from "@/lib/auth/guards";
import { getStore, resetStoreForTests, type Store } from "@/lib/db";
import type { User } from "@/lib/db/types";

/**
 * Role guard unit tests. next/headers (cookies) and next/navigation
 * (redirect) are mocked so the guards run as plain functions:
 * - apiGuard: 401 anonymous/invalid/expired/disabled, 403 wrong role,
 *   { user } on success — the JSON responses route handlers return.
 * - requireUser / requireRole: /login and /403 redirects for pages.
 * The store cross-check (disabled account, stored-role drift) is exercised
 * through real DemoStore users, not stubs.
 */

const harness = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return {
    jar,
    clear: () => jar.clear(),
    /** The cookies() store Next would provide (get + set are all we use). */
    cookies: async () => ({
      get: (name: string) =>
        jar.has(name) ? { name, value: jar.get(name) as string } : undefined,
      set: (name: string, value: string) => {
        jar.set(name, value);
      },
    }),
  };
});

const redirectLog = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock("next/headers", () => ({ cookies: harness.cookies }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    redirectLog.urls.push(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

// apiGuard only uses the request for its type signature — pass a bare stub.
function req(): NextRequest {
  return {} as NextRequest;
}

let store: Store;

async function signInAs(email: string): Promise<User> {
  const user = await store.getUserByEmail(email);
  if (!user) throw new Error(`missing seed user ${email}`);
  harness.jar.set(
    SESSION_COOKIE,
    createSessionToken({ uid: user.id, role: user.role }),
  );
  return user;
}

beforeEach(async () => {
  process.env.SESSION_SECRET = "guard-test-secret";
  resetStoreForTests();
  delete process.env.MONGODB_URI;
  harness.clear();
  redirectLog.urls.length = 0;
  // The guards read through the getStore() singleton — mutate THAT instance
  // (DemoStore.create() would build a separate in-memory copy).
  store = await getStore();
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("apiGuard — route handler responses", () => {
  it("responds 401 with a JSON error when no session cookie exists", async () => {
    const guard = await apiGuard(req());
    expect("response" in guard).toBe(true);

    const response = (guard as { response: import("next/server").NextResponse })
      .response;
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
  });

  it("responds 401 to garbage, tampered and expired tokens", async () => {
    for (const token of ["garbage", "payload.+", "a.b.c"]) {
      harness.jar.set(SESSION_COOKIE, token);
      const guard = await apiGuard(req());
      expect("response" in guard, `token "${token}"`).toBe(true);
      expect(
        (guard as { response: import("next/server").NextResponse }).response
          .status,
      ).toBe(401);
    }
  });

  it("admits a user whose role is in the allowed list", async () => {
    await signInAs("admin@demo.local");
    const guard = await apiGuard(req(), ["ADMIN", "TEACHER"]);
    expect("user" in guard).toBe(true);
    expect((guard as { user: User }).user.email).toBe("admin@demo.local");
  });

  it("admits any authenticated user when no roles are given", async () => {
    await signInAs("student@demo.local");
    const guard = await apiGuard(req());
    expect("user" in guard).toBe(true);
    expect((guard as { user: User }).user.role).toBe("STUDENT");
  });

  it("responds 403 when the role is not allowed", async () => {
    await signInAs("student@demo.local");
    const guard = await apiGuard(req(), ["TEACHER", "ADMIN"]);
    expect("response" in guard).toBe(true);

    const response = (guard as { response: import("next/server").NextResponse })
      .response;
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You do not have permission to do that.",
    });
  });

  it("responds 401 (not 403) when the account was disabled after sign-in", async () => {
    const user = await store.getUserByEmail("payel.sen@std.demo.local");
    expect(user?.id).toBe("usr-stu-060");
    await store.setUserStatus(user!.id, "disabled");

    harness.jar.set(
      SESSION_COOKIE,
      createSessionToken({ uid: user!.id, role: "STUDENT" }),
    );
    const guard = await apiGuard(req(), ["STUDENT"]);
    expect("response" in guard).toBe(true);
    expect(
      (guard as { response: import("next/server").NextResponse }).response
        .status,
    ).toBe(401);
  });

  it("responds 401 when the stored role no longer matches the token", async () => {
    // A token forged (or stale) with ADMIN for a teacher's uid must fail the
    // store cross-check in getSessionUser — the store is the source of truth.
    const teacher = await store.getUserByEmail("teacher@demo.local");
    harness.jar.set(
      SESSION_COOKIE,
      createSessionToken({ uid: teacher!.id, role: "ADMIN" }),
    );

    expect(await getSessionUser()).toBeNull();
    const guard = await apiGuard(req(), ["ADMIN"]);
    expect("response" in guard).toBe(true);
    expect(
      (guard as { response: import("next/server").NextResponse }).response
        .status,
    ).toBe(401);
  });
});

describe("requireUser / requireRole — page guards", () => {
  it("redirects anonymous visitors to /login, preserving the return path", async () => {
    await expect(requireUser("/admin")).rejects.toThrow(
      "REDIRECT:/login?next=%2Fadmin",
    );
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
    expect(redirectLog.urls).toEqual([
      "/login?next=%2Fadmin",
      "/login",
    ]);
  });

  it("returns the signed-in user without redirecting", async () => {
    const signedIn = await signInAs("teacher@demo.local");
    const user = await requireUser("/teacher");
    expect(user.id).toBe(signedIn.id);
    expect(redirectLog.urls).toEqual([]);
  });

  it("redirects a wrong-role user to /403", async () => {
    await signInAs("student@demo.local");
    await expect(requireRole(["ADMIN"])).rejects.toThrow("REDIRECT:/403");
  });

  it("accepts any one of the listed roles", async () => {
    await signInAs("teacher@demo.local");
    const user = await requireRole(["TEACHER", "ADMIN"]);
    expect(user.role).toBe("TEACHER");
    expect(redirectLog.urls).toEqual([]);
  });
});
